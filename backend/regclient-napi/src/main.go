package main

import "C"
import (
	"context"
	"encoding/json"
	"time"

	"github.com/regclient/regclient"
	"github.com/regclient/regclient/config"
	"github.com/regclient/regclient/types/blob"
	v1 "github.com/regclient/regclient/types/oci/v1"
	"github.com/regclient/regclient/types/ref"
)

type Result struct {
	Success bool      `json:"success"`
	Error   *string   `json:"error"`
	Result  *v1.Image `json:"result"`
}

//export GetImageInfo
func GetImageInfo(refIn *C.char, usernameIn *C.char, passwordIn *C.char, tlsOverrideHostnameIn *C.char, tlsOverrideStateIn *C.char) *C.char {
	goRefInput := C.GoString(refIn)
	username := C.GoString(usernameIn)
	password := C.GoString(passwordIn)
	tlsOverrideHostname := C.GoString(tlsOverrideHostnameIn)
	tlsOverrideState := C.GoString(tlsOverrideStateIn)
	result, err := getImageInfo(goRefInput, username, password, tlsOverrideHostname, tlsOverrideState)

	if err != nil {
		msg := err.Error()
		str, err := json.Marshal(&Result{Success: false, Error: &msg})
		if err != nil {
			return C.CString("{\"success\":false,\"error\":\"failed to marshal error response\"}")
		}
		return C.CString(string(str))
	}

	config := result.GetConfig()
	str, err := json.Marshal(&Result{Success: true, Result: &config})
	if err != nil {
		return C.CString("{\"success\":false,\"error\":\"failed to marshal success response\"}")
	}

	return C.CString(string(str))
}

func getImageInfo(refInput string, username string, password string, tlsOverrideHostname string, tlsOverrideState string) (*blob.BOCIConfig, error) {
	// https://github.com/regclient/regclient/blob/b59559fa7f07b20fc367f158468632f26e17b3fc/cmd/regctl/image.go#L1617

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	r, err := ref.New(refInput)
	if err != nil {
		return nil, err
	}

	hosts := []config.Host{}

	hasCredentials := len(username) > 0 && len(password) > 0

	if len(tlsOverrideHostname) > 0 {
		var hostTLS config.TLSConf
		err := hostTLS.UnmarshalText([]byte(tlsOverrideState))

		if err != nil {
			return nil, err
		}

		host := config.Host{
			Name: tlsOverrideHostname,
			TLS:  hostTLS,
		}

		if hasCredentials {
			host.User = username
			host.Pass = password
		}

		hosts = append(hosts, host)
	} else if hasCredentials {
		registryHostname := r.Registry

		hosts = append(hosts, config.Host{
			Name: registryHostname,
			User: username,
			Pass: password,
		})
	}

	opts := []regclient.Opt{}
	if len(hosts) > 0 {
		opts = append(opts, regclient.WithConfigHost(hosts...))
	}

	client := regclient.New(opts...)

	manifest, err := client.ImageConfig(ctx, r)
	if err != nil {
		return manifest, err
	}

	err = client.Close(ctx, r)

	return manifest, err
}

func main() {

}
