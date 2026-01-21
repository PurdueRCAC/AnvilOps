#!/bin/bash

# This script releases a new version to staging.
# Usage: ./release-staging.sh

export REGISTRY_BASE="registry.anvil.rcac.purdue.edu/anvilops-staging"
export HELM_ARTIFACT_TAG="oci://registry.anvil.rcac.purdue.edu/anvilops-staging/chart"
# note that GENERATE_GITHUB_RELEASE is not exported in this script, but it is in release-production.sh

COMMIT="$(git rev-parse HEAD)"
VERSION="0.0.0-staging.$(date +%s)-${COMMIT:0:10}"

CURRENT_DIR=$(dirname "$0")
$CURRENT_DIR/release.sh "$VERSION"
