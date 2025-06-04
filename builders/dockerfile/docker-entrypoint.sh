#!/bin/bash

# This is the Dockerfile builder. It clones a repository and builds and pushes an image using the Dockerfile located at the specified path.
# Then, it notifies the backend to deploy the new version of the image.

mkdir -p ./work

cd work

git clone $CLONE_URL --depth=1 .

buildctl \
 --addr=tcp://buildkitd:1234 \
 --wait \
 --tlsdir /certs \
 build \
 --frontend dockerfile.v0 \
 --local context=. \
 --local dockerfile=. \
 --cache-from type=registry,ref=$CACHE_TAG \
 --cache-to type=registry,ref=$CACHE_TAG \
 --output type=image,name=$IMAGE_TAG,push=true