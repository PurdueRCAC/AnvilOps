#!/bin/bash

# This is the Railpack builder. It clones a repository, prepares a build plan with Railpack, and builds and pushes an image.
# Then, it notifies the backend to deploy the new version of the image.

set -eo pipefail

set_status() {
  wget --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"$1\"}" -O- $DEPLOYMENT_API_URL/deployment/update
}

cd /work

set_status BUILDING

git clone $CLONE_URL --depth=1 /work/repo

build() {
  # Railpack is a tool that generates BuildKit LLB from a repository by looking at the files it contains and making an educated guess on the repo's technologies, package managers, etc.
  # https://railpack.com/
  railpack prepare "/work/repo/$ROOT_DIRECTORY" --plan-out /work/railpack-plan.json --info-out /work/railpack-info.json &&
  
  # https://railpack.com/guides/running-railpack-in-production/#building-with-buildkit
  buildctl \
    --addr=tcp://buildkitd:1234 \
    --wait \
    --tlsdir /certs \
    build \
    --frontend gateway.v0 \
    --opt source=registry.anvil.rcac.purdue.edu/anvilops/railpack-frontend:latest \
    --local "context=/work/repo/$ROOT_DIRECTORY" \
    --local dockerfile=/work \
    --export-cache type=registry,ref=$CACHE_TAG \
    --import-cache type=registry,ref=$CACHE_TAG \
    --output type=image,name=$IMAGE_TAG,push=true
  # TODO: when adding support for secrets, remember to invalidate the cache when their values change: https://railpack.com/guides/running-railpack-in-production/#layer-invalidation
}

if build ; then
  set_status DEPLOYING
else
  set_status ERROR
fi
