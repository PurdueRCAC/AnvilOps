#!/bin/bash

# This is the Railpack builder. It clones a repository, prepares a build plan with Railpack, and builds and pushes an image.
# Then, it notifies the backend to deploy the new version of the image.

set -eo pipefail

set_status() {
  wget -q --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"$1\"}" -O- "$DEPLOYMENT_API_URL/deployment/update"
}

run_job() {
  cd /work

  set_status "BUILDING"

  git config --global advice.detachedHead false # The clone command below puts is in a "detached HEAD" state (https://git-scm.com/docs/git-checkout/2.47.1#_detached_head), but the warning isn't useful in a CI environment. This disables it.
  git clone "$CLONE_URL" --depth=1 --shallow-submodules --revision="$REF" /work/repo

  build() {
    # Railpack is a tool that generates BuildKit LLB from a repository by looking at the files it contains and making an educated guess on the repo's technologies, package managers, etc.
    # https://railpack.com/
    railpack prepare "/work/repo/$ROOT_DIRECTORY" $RAILPACK_ENV_ARGS --plan-out /work/railpack-plan.json --info-out /work/railpack-info.json &&
    
    # https://railpack.com/guides/running-railpack-in-production/#building-with-buildkit
    buildctl \
      --addr="$BUILDKITD_ADDRESS" \
      --wait \
      --tlsdir /certs \
      build \
      --frontend gateway.v0 \
      --opt source=registry.anvil.rcac.purdue.edu/anvilops/railpack-frontend:latest \
      --local context="/work/repo/$ROOT_DIRECTORY" \
      --local dockerfile=/work \
      $BUILDKIT_SECRET_DEFS \
      --opt "secrets-hash=$SECRET_CHECKSUM" \
      --export-cache type=registry,ref="$CACHE_TAG" \
      --import-cache type=registry,ref="$CACHE_TAG" \
      --output type=image,name="$IMAGE_TAG",push=true
    # TODO: when adding support for secrets, remember to invalidate the cache when their values change: https://railpack.com/guides/running-railpack-in-production/#layer-invalidation
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
