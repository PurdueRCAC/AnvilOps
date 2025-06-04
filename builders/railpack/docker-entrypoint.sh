#!/bin/bash

# This is the Railpack builder. It clones a repository, prepares a build plan with Railpack, and builds and pushes an image.
# Then, it notifies the backend to deploy the new version of the image.

mkdir -p ./work

git clone $CLONE_URL --depth=1 ./work

# Railpack is a tool that generates BuildKit LLB from a repository by looking at the files it contains and making an educated guess on the repo's technologies, package managers, etc.
# https://railpack.com/
railpack prepare ./work --plan-out ./railpack-plan.json --info-out ./railpack-info.json

# https://railpack.com/guides/running-railpack-in-production/#building-with-buildkit
buildctl \
 --addr=tcp://buildkitd:1234 \
 --wait \
 --tlsdir /certs \
 build \
 --frontend gateway.v0 \
 --opt source=ghcr.io/railwayapp/railpack:railpack-frontend \
 --local context=./work \
 --local dockerfile=./railpack-plan.json \
 --cache-from type=registry,ref=$CACHE_TAG \
 --cache-to type=registry,ref=$CACHE_TAG \
 --output type=image,name=$IMAGE_TAG,push=true

 # TODO: when adding support for secrets, remember to invalidate the cache when their values change: https://railpack.com/guides/running-railpack-in-production/#layer-invalidation
 