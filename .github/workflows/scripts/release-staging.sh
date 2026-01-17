#!/bin/bash

# This script releases a new version to staging.
# Usage: ./release-staging.sh

# TODO update these to use proper staging repo
export REGISTRY_BASE="registry.anvil.rcac.purdue.edu/anvilops-brendan-dev"
export HELM_ARTIFACT_TAG="oci://registry.anvil.rcac.purdue.edu/anvilops-brendan-dev/chart"
# note that GENERATE_GITHUB_RELEASE is not exported in this script, but it is in release-production.sh

VERSION="$(date +%s)-$(git rev-parse HEAD)"

CURRENT_DIR=$(dirname "$0")
$CURRENT_DIR/release.sh "0.0.0-staging.$VERSION"
