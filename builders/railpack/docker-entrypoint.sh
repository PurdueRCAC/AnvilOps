#!/bin/sh

# This is the Railpack builder. It clones a repository, prepares a build plan with Railpack, and builds and pushes an image.
# Then, it notifies the backend to deploy the new version of the image.

set -eo pipefail

cd /work

wget --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"BUILDING\"}" -O- $DEPLOYMENT_API_URL/deployment/update

git clone $CLONE_URL --depth=1 /work/repo

# Railpack is a tool that generates BuildKit LLB from a repository by looking at the files it contains and making an educated guess on the repo's technologies, package managers, etc.
# https://railpack.com/
railpack prepare "/work/repo/$ROOT_DIRECTORY" --plan-out /work/railpack-plan.json --info-out /work/railpack-info.json

# https://railpack.com/guides/running-railpack-in-production/#building-with-buildkit
buildctl \
 --addr=tcp://buildkitd:1234 \
 --wait \
 --tlsdir /certs \
 build \
 --frontend gateway.v0 \
 --opt source=ghcr.io/railwayapp/railpack:railpack-frontend \
 --local "context=/work/repo/$ROOT_DIRECTORY" \
 --local dockerfile=/work/railpack-plan.json \
 --export-cache type=registry,ref=$CACHE_TAG \
 --import-cache type=registry,ref=$CACHE_TAG \
 --output type=image,name=$IMAGE_TAG,push=true

 # TODO: when adding support for secrets, remember to invalidate the cache when their values change: https://railpack.com/guides/running-railpack-in-production/#layer-invalidation

wget --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"DEPLOYING\"}" -O- $DEPLOYMENT_API_URL/deployment/update
