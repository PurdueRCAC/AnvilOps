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
	"sync"
	"time"
)

var uploadQueue chan LogLine
var m sync.RWMutex

// This program accepts at least two arguments. The first one is the name of the program to run,
// and the remaining arguments are the command-line arguments to pass to that program.
func main() {
	uploadQueue = make(chan LogLine, 500)

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
				if cmd.ProcessState != nil && !cmd.ProcessState.Exited() {
					err := cmd.Process.Signal(signal)
					if err != nil {
						panic("Error relaying signal to process: " + err.Error())
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
	done := drainUploadQueue(*env)

	err := cmd.Start()

	if err != nil {
		panic(err.Error())
	}

	err = cmd.Wait()
	if err != nil {
		panic("Error waiting for process to terminate: " + err.Error())
	}

	// Stop listening for signals
	signal.Stop(sig)
	close(sig)

	fmt.Printf("Process exited with status %v\n", cmd.ProcessState.ExitCode())

	// Stop the upload loop
	done <- true

	// TODO add timeout
	m.RLock() // Block until all log lines have been uploaded (we can't acquire the reader lock while the writer lock is held)

	close(uploadQueue)

	os.Exit(cmd.ProcessState.ExitCode())
}

// Reads the bytes of file and uploads them to dest (a URL) with token as a Bearer token in the Authorization header.
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
		line := scanner.Text()
		select {
		case uploadQueue <- LogLine{
			Stream:    name,
			Content:   line,
			Timestamp: time.Now().UnixMilli(),
		}:
		default:
			{
				fmt.Println("Upload buffer is full")
				// The buffer is full; we can't add any more log lines until the current ones are uploaded.
			}
		}
	}
}

func drainUploadQueue(env EnvVars) chan bool {
	ticker := time.NewTicker(500 * time.Millisecond)
	done := make(chan bool)

	hostname, err := os.Hostname()
	if err != nil {
		hostname = ""
	}

	go func() {
	outer:
		for {
			select {
			case <-ticker.C:
				// Every 500ms, send all items in the upload queue to the AnvilOps backend

				if len(uploadQueue) == 0 {
					continue
				}

				m.Lock()

				// Drain the queue into a slice
				lines := make([]LogLine, 0, len(uploadQueue))
				for len(uploadQueue) > 0 {
					lines = append(lines, <-uploadQueue)
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
						// TODO what do we do if the queue is full?
						uploadQueue <- line
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
						// TODO what do we do if the queue is full?
						uploadQueue <- line
					}
				} else {
					res.Body.Close()
				}

				m.Unlock()
			case <-done:
				break outer
			}
		}
	}()

	return done
}

type LogLine struct {
	Content string `json:"content"`
	// Either "stdout" or "stderr"
	Stream string `json:"stream"`
	// The log line's timestamp represented as a Unix timestamp in milliseconds
	Timestamp int64 `json:"timestamp"`
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
// (TODO Ban these names from user-provided environment variables)
// - _PRIVATE_ANVILOPS_LOG_ENDPOINT
// - _PRIVATE_ANVILOPS_LOG_TYPE
// - _PRIVATE_ANVILOPS_LOG_TOKEN
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
			fallthrough
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
