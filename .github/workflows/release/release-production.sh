#!/bin/bash

# This script releases a new version to production

# Usage: ./release-production.sh [version]

BRANCH=$(git branch --show-current)

if [ -z "$1" ]; then
  echo "Usage: $0 [version]"
  exit 1
fi

if [ ! -v CI ]; then
  read -pr "Script isn't being called from CI; are you sure you want to create a new GitHub release and push to the production registry namespace? (y/n): " response

  if [ "$response" != "y" ]; then
    exit 0
  fi
fi

if [ "$BRANCH" != "main" ]; then
  read -pr "Current branch isn't main; are you sure you want to create a new GitHub release and push to the production registry namespace? (y/n): " response

  if [ "$response" != "y" ]; then
    exit 0
  fi
fi

export REGISTRY_BASE="registry.anvil.rcac.purdue.edu/anvilops"
export HELM_ARTIFACT_TAG="oci://registry.anvil.rcac.purdue.edu/anvilops/chart"
export GENERATE_GITHUB_RELEASE="1"

CURRENT_DIR=$(dirname "$0")
"$CURRENT_DIR"/release.sh "$1"
