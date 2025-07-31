#!/bin/bash

set -e

# This script rebuilds AnvilOps, imports the image into Minikube, and restarts the AnvilOps deployment.
# Run it from the root of the project (be inside the directory that contains backend/, frontend/, builders/, charts/, etc.)

TAG=anvilops/anvilops:$(date +'%s')

# We're also tagging it as latest just in case the Helm chart is redeployed.

minikube image build . -t $TAG
minikube image tag $TAG anvilops/anvilops:dev
kubectl patch deployment anvilops --patch='{"spec":{"template":{"spec":{"containers":[{"name":"anvilops","image":"'"$TAG"'"}]}}}}'
