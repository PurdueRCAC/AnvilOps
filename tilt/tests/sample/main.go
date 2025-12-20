package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/", handle)
	err := http.ListenAndServe("0.0.0.0:8080", nil)
	if err != nil {
		log.Fatalf("Failed to find to port: %v\n", err)
	}
}

func handle(rw http.ResponseWriter, req *http.Request) {
	_, err := rw.Write([]byte("Hello, world!\n"))
	if err != nil {
		fmt.Errorf("Failed to write response: %v\n", err)
	}
}
