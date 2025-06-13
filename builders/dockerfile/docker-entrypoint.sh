#!/bin/sh

# This is the Dockerfile builder. It clones a repository and builds and pushes an image using the Dockerfile located at the specified path.
# Then, it notifies the backend to deploy the new version of the image.

set -eo pipefail

cd /work

wget --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"BUILDING\"}" -O- $DEPLOYMENT_API_URL/deployment/update

git clone $CLONE_URL --depth=1 .

cd "$ROOT_DIRECTORY"

buildctl \
 --addr=tcp://buildkitd:1234 \
 --wait \
 --tlsdir /certs \
 --debug \
 build \
 --frontend dockerfile.v0 \
 --local context=. \
 --local dockerfile="$DOCKERFILE_PATH" \
 --import-cache type=registry,ref=$CACHE_TAG \
 --export-cache type=registry,ref=$CACHE_TAG \
 --output type=image,name=$IMAGE_TAG,push=true \
 --progress plain

wget --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"DEPLOYING\"}" -O- $DEPLOYMENT_API_URL/deployment/update
