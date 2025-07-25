#!/bin/bash

# This is the Dockerfile builder. It clones a repository and builds and pushes an image using the Dockerfile located at the specified path.
# Then, it notifies the backend to deploy the new version of the image.

set -eo pipefail

set_status() {
  wget -q --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"$1\"}" -O- "$DEPLOYMENT_API_URL/deployment/update"
}

run_job() {
  cd /work

  set_status "BUILDING"

  git config --global advice.detachedHead false # The clone command below puts is in a "detached HEAD" state (https://git-scm.com/docs/git-checkout/2.47.1#_detached_head), but the warning isn't useful in a CI environment. This disables it.
  git clone "$CLONE_URL" --depth=1 --shallow-submodules --revision="$REF" .

  cd "$ROOT_DIRECTORY"

  DOCKERFILE_DIR=$(dirname "$DOCKERFILE_PATH")
  DOCKERFILE_NAME=$(basename "$DOCKERFILE_PATH")

  build() {
    buildctl \
    --addr="$BUILDKITD_ADDRESS" \
    --wait \
    --tlsdir /certs \
    --debug \
    build \
    --frontend dockerfile.v0 \
    --local context=. \
    --local dockerfile="$DOCKERFILE_DIR" \
    $BUILDKIT_SECRET_DEFS \
    --opt "build-arg:anvilops-secrets-checksum=$SECRET_CHECKSUM" \
    --opt filename="./$DOCKERFILE_NAME" \
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
