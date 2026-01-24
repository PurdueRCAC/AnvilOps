#!/bin/bash

set -eo pipefail

set_status() {
  wget -q --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"$1\"}" -O- "$DEPLOYMENT_API_URL/deployment/update"
}

run_job() {
  read -r -a args <<< "$HELM_ARGS"
  helm "${args[@]}"
}

set_status "DEPLOYING"

if run_job ; then
  set_status "COMPLETE"
else
  set_status "ERROR"
  exit 1
fi