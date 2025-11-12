package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var uploadQueue chan LogLine

// The maximum number of times the program will attempt to upload a single log line.
// After this amount of attempts, the line will be dropped.
const MAX_UPLOAD_ATTEMPTS = 5

// The maximum amount of time to wait between starting a new batch and uploading it.
// Longer lengths will allow for larger, less frequent batches.
const UPLOAD_BATCH_LENGTH_MS = 500

// The maximum number of lines that can be uploaded in one batch.
const MAX_BATCH_SIZE = 500

// The exit code for a termination caused by a signal is 128 + (signal number).
const SIGNAL_TERMINATION_BASE = 128

// This program accepts at least two arguments. The first one is the name of the program to run,
// and the remaining arguments are the command-line arguments to pass to that program.
func main() {
	uploadQueue = make(chan LogLine, MAX_BATCH_SIZE)

	args := os.Args[1:] // The first argument is the name of this program, so we can ignore that

	programName := args[0]
	programArgs := args[1:]

	env, childEnv := getAnvilOpsEnvVars()

	cmd := exec.Command(programName, programArgs...)
	cmd.Env = childEnv

	sig := make(chan os.Signal, 1)
	{
		// Relay all signals sent to this process to its child process
		signal.Notify(sig)

		go func() {
			for signal := range sig {
				// Forward signals if cmd.Start() was called successfully,
				// and the final process state is not available yet
				if cmd.Process != nil && cmd.ProcessState == nil {
					err := cmd.Process.Signal(signal)
					if err != nil {
						fmt.Fprintf(os.Stderr, "Error relaying signal to process: %s\n", err.Error())
					}
				}
			}
		}()
	}

	{
		// Read the process's stdout and send it to the AnvilOps backend
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			panic("Error setting up stdout redirection: " + err.Error())
		}
		defer stdout.Close()
		go readStream("stdout", stdout)
	}

	{
		// Same as above but for `stderr`
		stderr, err := cmd.StderrPipe()
		if err != nil {
			panic("Error setting up stderr redirection: " + err.Error())
		}
		defer stderr.Close()
		go readStream("stderr", stderr)
	}

	// Start draining log lines from the queue and sending them to the AnvilOps backend
	done := drainUploadQueue(env, MAX_BATCH_SIZE)

	err := cmd.Start()

	if err != nil {
		panic(err.Error())
	}

	err = cmd.Wait()

	exitCode := cmd.ProcessState.ExitCode()
	if err != nil {
		os.Stderr.WriteString(err.Error())

		// If the command exited due to a signal, cmd.ProcessState.ExitCode() returns -1
		// Use the signal number to get the true exit code
		// This method works on UNIX systems
		status := err.(*exec.ExitError).Sys().(syscall.WaitStatus)
		if status.Signaled() {
			exitCode = SIGNAL_TERMINATION_BASE + int(status.Signal())
		}
	}

	// Stop listening for signals
	signal.Stop(sig)
	close(sig)

	fmt.Printf("Process exited with status %v\n", exitCode)

	// Stop the upload loop
	close(uploadQueue)

	go func() {
		// If it takes longer than 10 seconds to flush the remaining logs, stop the program without sending them
		time.Sleep(10 * time.Second)
		os.Exit(exitCode)
	}()

	<-done // Wait for remaining log lines to be uploaded
	os.Exit(exitCode)
}

// readStream reads the bytes of file and uploads them to dest (a URL) with token as a Bearer token in the Authorization header.
func readStream(name string, file io.Reader) {
	scanner := bufio.NewScanner(file)

	scan := func() bool {
		var ret bool
		defer func() {
			if r := recover(); r != nil {
				// The scanner panics if there is a line longer than its buffer size.
				// At this point, we should ship off the current line (scanner.Text()),
				// even though it doesn't end with a newline character, and continue reading.
				ret = true // Override the return value to indicate that we did read a line successfully
			}
		}()
		ret = scanner.Scan()
		return ret
	}

	for scan() {
		// Print the line to the standard output so that `kubectl logs` will still work to view the app's logs
		if name == "stderr" {
			os.Stderr.Write(scanner.Bytes())
			os.Stderr.Write([]byte("\n"))
		} else {
			os.Stdout.Write(scanner.Bytes())
			os.Stdout.Write([]byte("\n"))
		}
		// Enqueue the line to be uploaded to the AnvilOps backend
		// Wait up to 100ms for the queue to empty, otherwise drop the message
		line := scanner.Text()

		select {
		case uploadQueue <- LogLine{
			Stream:    name,
			Content:   line,
			Timestamp: time.Now().UnixMilli(),
			attempts:  0,
		}:
		case <-time.After(100 * time.Millisecond):
			{
				fmt.Println("Upload buffer is full")
			}
		}
	}
}

// drainUploadQueue continuously receives logs from the uploadQueue and uploads them.
// It waits until a log is received and then waits up to UPLOAD_BATCH_LENGTH_MS
// milliseconds for additional logs to arrive in the current batch. When that timeout
// occurs (or when the batch fills up), the batch is uploaded.
//
// drainUploadQueue returns a channel which is closed when uploadQueue is closed and
// all logs have been uploaded.
func drainUploadQueue(env *EnvVars, maxBatchSize int) chan bool {
	done := make(chan bool)

	go func() {
		defer close(done)
	outer:
		for {
			batch := make([]LogLine, 0, maxBatchSize)

			// Wait for a log to arrive
			first, ok := <-uploadQueue
			if !ok { // uploadQueue is closed
				return
			}

			batch = append(batch, first)

			// Add logs received shortly after the first line to the current batch
			timer := time.NewTimer(UPLOAD_BATCH_LENGTH_MS * time.Millisecond)
			for {
				select {
				case log, ok := <-uploadQueue:
					{
						if !ok { // uploadQueue is closed
							send(batch, env)
							return
						}

						batch = append(batch, log)
						if len(batch) >= maxBatchSize {
							// If we've filled up our buffer, upload the current batch immediately
							send(batch, env)
							continue outer
						}
					}
				case <-timer.C:
					{
						// We've waited the maximum allowed amount of time for this batch and it hasn't filled up; upload it now
						send(batch, env)
						continue outer
					}
				}
			}
		}
	}()

	return done
}

// send uploads the slice of log lines to the server.
// If there was a problem uploading a log line, it is added to the end of the uploadQueue.
// If the uploadQueue is full, the log line is dropped.
func send(lines []LogLine, env *EnvVars) {
	hostname, err := os.Hostname()
	if err != nil {
		hostname = ""
	}
	body := LogUploadRequest{
		Type:         env.LogType,
		Lines:        lines,
		DeploymentID: env.DeploymentID,
		Hostname:     hostname,
	}

	json, err := json.Marshal(body)

	if err != nil {
		panic("Error marshalling JSON: " + err.Error())
	}

	buf := bytes.NewBuffer(json)

	req, err := http.NewRequest("POST", env.LogIngestAddress, buf)

	if err != nil {
		panic("Error creating HTTP request: " + err.Error())
	}

	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("Authorization", "Bearer "+env.LogIngestToken)

	res, err := http.DefaultClient.Do(req)

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error uploading logs: %v\n", err)
		for _, line := range lines {
			if line.attempts <= MAX_UPLOAD_ATTEMPTS {
				line.attempts++
				select {
				case uploadQueue <- line:
				default: // If the upload queue is now full, it will be dropped instead of blocking until the queue is empty. If we block here, the queue will never be drained again because we're inside the loop that processes the queue.
				}
			}
		}
	} else if res.StatusCode != 200 {
		body, err := io.ReadAll(res.Body)
		res.Body.Close()

		if err != nil {
			fmt.Fprintf(os.Stderr, "Error uploading logs: %v (error reading response body)\n", res.StatusCode)
		} else {
			fmt.Fprintf(os.Stderr, "Error uploading logs: %v %v\n", res.StatusCode, string(body))
		}

		for _, line := range lines {
			if line.attempts <= MAX_UPLOAD_ATTEMPTS {
				line.attempts++
				select {
				case uploadQueue <- line:
				default: // Same as above
				}
			}
		}
	} else {
		res.Body.Close()
	}
}

type LogLine struct {
	Content string `json:"content"`
	// Either "stdout" or "stderr"
	Stream string `json:"stream"`
	// The log line's timestamp represented as a Unix timestamp in milliseconds
	Timestamp int64 `json:"timestamp"`
	// The amount of times we have attempted to upload this log line
	attempts int
}

type LogUploadRequest struct {
	// Either "build" or "runtime"
	Type         string    `json:"type"`
	Lines        []LogLine `json:"lines"`
	DeploymentID int       `json:"deploymentId"`
	Hostname     string    `json:"hostname"`
}

type EnvVars struct {
	// The URL to send logs
	LogIngestAddress string
	// "build" or "runtime" depending on whether we're capturing logs from BuildKit or not
	LogType string
	// A `Bearer` token
	LogIngestToken string
	DeploymentID   int
}

// When this pod is created, it has some extra environment variables:
//
// - _PRIVATE_ANVILOPS_LOG_ENDPOINT
// - _PRIVATE_ANVILOPS_LOG_TYPE
// - _PRIVATE_ANVILOPS_LOG_TOKEN
// - _PRIVATE_ANVILOPS_LOG_DEPLOYMENT_ID
//
// This function returns a struct with the environment variables specific to the log shipper
// (mentioned above) and a string array of variables that can be passed to the child process.
func getAnvilOpsEnvVars() (*EnvVars, []string) {
	env := os.Environ()

	anvilOpsEnv := &EnvVars{}
	childEnv := make([]string, len(env))

	for _, variable := range env {
		key, value, found := strings.Cut(variable, "=")
		if !found {
			panic("Invalid environment variable format: = expected but not found")
		}
		switch key {
		case "_PRIVATE_ANVILOPS_LOG_ENDPOINT":
			anvilOpsEnv.LogIngestAddress = value
		case "_PRIVATE_ANVILOPS_LOG_TOKEN":
			anvilOpsEnv.LogIngestToken = value
		case "_PRIVATE_ANVILOPS_LOG_TYPE":
			anvilOpsEnv.LogType = value
		case "_PRIVATE_ANVILOPS_LOG_DEPLOYMENT_ID":
			number, err := strconv.Atoi(value)
			if err != nil {
				panic("Invalid deployment ID: " + err.Error())
			}
			anvilOpsEnv.DeploymentID = number
		default:
			childEnv = append(childEnv, variable)
		}
	}

	if anvilOpsEnv.LogIngestAddress == "" {
		panic("Log ingest address not provided")
	}

	if anvilOpsEnv.LogIngestToken == "" {
		panic("Log ingest token not provided")
	}

	if anvilOpsEnv.DeploymentID == 0 {
		panic("Deployment ID not provided")
	}

	return anvilOpsEnv, childEnv
}
