#!/bin/bash

# This is the Railpack builder. It clones a repository, prepares a build plan with Railpack, and builds and pushes an image.
# Then, it notifies the backend to deploy the new version of the image.

set -eo pipefail

set_status() {
  wget -q --header="Content-Type: application/json" --post-data "{\"secret\":\"$DEPLOYMENT_API_SECRET\",\"status\":\"$1\"}" -O- "$DEPLOYMENT_API_URL/deployment/update"
}

run_job() {
  mkdir -p "/tmp/railpack/mise"
  cp -r "/usr/bin/mise/" "/tmp/railpack/"

  cd /home/appuser

  set_status "BUILDING"

  git config --global advice.detachedHead false # The clone command below puts is in a "detached HEAD" state (https://git-scm.com/docs/git-checkout/2.47.1#_detached_head), but the warning isn't useful in a CI environment. This disables it.
  git clone "$CLONE_URL" --depth=1 --shallow-submodules --revision="$REF" /home/appuser/repo 2>&1

  build() {
    # Railpack is a tool that generates BuildKit LLB from a repository by looking at the files it contains and making an educated guess on the repo's technologies, package managers, etc.
    # https://railpack.com/
    railpack prepare "/home/appuser/repo/$ROOT_DIRECTORY" $RAILPACK_ENV_ARGS --plan-out /home/appuser/railpack-plan.json --info-out /home/appuser/railpack-info.json &&

    # The images that Railpack uses internally are hard-coded:
    # https://github.com/railwayapp/railpack/blob/736c6a11baedf8372e2cefbb2b4f4826183fbfa4/core/plan/plan.go#L4
    # Replace these image references with our own to reduce risk of breaking changes (`latest` tag) and to remove the dependency on GitHub at runtime
    jq --arg builder "$RAILPACK_INTERNAL_BUILDER_IMAGE" --arg runtime "$RAILPACK_INTERNAL_RUNTIME_IMAGE" \
      'walk(
        if type == "object" and .image == "ghcr.io/railwayapp/railpack-builder:latest" then .image = $builder
        elif type == "object" and .image == "ghcr.io/railwayapp/railpack-runtime:latest" then .image = $runtime
        else . end
      )' railpack-plan.json > output.json &&

    mv output.json railpack-plan.json &&
    
    # https://railpack.com/guides/running-railpack-in-production/#building-with-buildkit
    buildctl \
      --addr="$BUILDKITD_ADDRESS" \
      --wait \
      --tlsdir /certs \
      build \
      --frontend gateway.v0 \
      --opt source="$RAILPACK_INTERNAL_FRONTEND_IMAGE" \
      --local context="/home/appuser/repo/$ROOT_DIRECTORY" \
      --local dockerfile=/home/appuser \
      $BUILDKIT_SECRET_DEFS \
      --opt "secrets-hash=$SECRET_CHECKSUM" \
      --export-cache type=registry,ref="$CACHE_TAG" \
      --import-cache type=registry,ref="$CACHE_TAG" \
      --output type=image,name="$IMAGE_TAG",push=true \
      --progress plain 2>&1
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
