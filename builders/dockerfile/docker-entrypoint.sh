#!/bin/bash

# This is the Dockerfile builder. It clones a repository and builds and pushes an image using the Dockerfile located at the specified path.
# Then, it notifies the backend to deploy the new version of the image.

set -eo pipefail

set_status() {
  wget --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"$1\"}" -O- "$DEPLOYMENT_API_URL/deployment/update"
}

run_job() {
  cd /work

  set_status "BUILDING"

  git clone "$CLONE_URL" --depth=1 --shallow-submodules --revision="$REF" .

  cd "$ROOT_DIRECTORY"

  build() {
    buildctl \
    --addr=tcp://buildkitd:1234 \
    --wait \
    --tlsdir /certs \
    --debug \
    build \
    --frontend dockerfile.v0 \
    --local context=. \
    --local dockerfile="$DOCKERFILE_PATH" \
    --import-cache type=registry,ref="$CACHE_TAG" \
    --export-cache type=registry,ref="$CACHE_TAG" \
    --output type=image,name="$IMAGE_TAG",push=true \
    --progress plain
  }

  if build ; then
    set_status "DEPLOYING"
  else
    set_status "ERROR"
  fi
}

if ! run_job ; then
  set_status "ERROR"
  exit 1
fi