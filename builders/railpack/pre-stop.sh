#!/bin/bash

# This script is executed when the pod is forcefully terminated

set_status() {
  wget --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"$1\"}" -O- "$DEPLOYMENT_API_URL/deployment/update"
}

set_status "ERROR"
