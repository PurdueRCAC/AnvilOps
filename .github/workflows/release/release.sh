#!/bin/bash

# Releases a new version of AnvilOps by:
# - building and pushing all container images
# - updating the default image references in the Helm chart values.yaml
# - updating the Helm chart version
# - pushing a new commit with those changes
# - pushing the updated Helm chart to the registry
# - creating a new GitHub release

# Usage: ./release.sh [version]
# `version` is the new version number. It is used to generate Docker image tags and to update the Helm chart version.

# Expected environment variables:
# - REGISTRY_BASE: the Docker registry hostname + namespace to push the image to, not including the image names or versions
# - HELM_ARTIFACT_TAG: the OCI registry hostname + namespace to push the Helm chart to. The final tag will have "/anvilops:$VERSION" appended at the end, where $VERSION is the first argument to this script.
# - GENERATE_GITHUB_RELEASE: set this to any value to update the Helm chart values, commit and push them to GitHub, and create a new GitHub release

set -euo pipefail

CURRENT_DIR=$(dirname "$0")
PROJECT_ROOT="$CURRENT_DIR/../../../"
VERSION="$1"

CHART_DIR="$PROJECT_ROOT/charts/anvilops"
VALUES_FILE="$CHART_DIR/values.yaml"
CHART_FILE="$CHART_DIR/Chart.yaml"

NOTES_FILE="$(mktemp)"
BACKUP_DIR="$(mktemp -d)"

echo "Storing old Chart files in $BACKUP_DIR"
cp "$VALUES_FILE" "$BACKUP_DIR"
cp "$CHART_FILE" "$BACKUP_DIR"

echo "Releasing AnvilOps version $VERSION..."

set_value() {
  FILE="$1"
  export KEY="$2"
  export VALUE="$3"
  yq -i 'eval(strenv(KEY)) = strenv(VALUE)' "$FILE"
}

build_and_push() {
  DOCKERFILE="$PROJECT_ROOT/$1"
  BUILD_CONTEXT="$PROJECT_ROOT/$2"
  CHART_KEY="$3"
  IMAGE_TAG="$4:$VERSION"
  CACHE_TAG="$4:build-cache"

  IIDFILE=$(mktemp)

  docker buildx build \
    --push \
    -f "$DOCKERFILE" \
    --iidfile "$IIDFILE" \
    -t "$IMAGE_TAG" \
    --cache-from="type=registry,ref=$CACHE_TAG" \
    --cache-to="type=registry,ref=$CACHE_TAG,mode=max" \
    "$BUILD_CONTEXT"

  IMAGE_ID=$(cat "$IIDFILE") # looks like "sha256:32975dcafd44d8c6f921d2276e2a39f42f268e8c9584d6c4d4c88f5a073b7b1d"
  rm "$IIDFILE"

  IMAGE_REF="$IMAGE_TAG@$IMAGE_ID"
  echo "Built image: $IMAGE_REF"
  echo "- \`$IMAGE_REF\`" >> "$NOTES_FILE"

  set_value "$VALUES_FILE" "$CHART_KEY" "$IMAGE_REF"
}

copy_image() {
  KEY="$1"
  SOURCE="$2"
  DEST="$3"

  if [ -x "$(command -v regctl)" ]; then
    # regctl allows us to copy the image much faster and avoid downloading duplicate blobs that don't need to be uploaded to the destination registry
    regctl image copy "$SOURCE" "$DEST"
    IMAGE_ID=$(regctl image digest "$DEST")
  elif [ -x "$(command -v skopeo)" ]; then
    # Skopeo can do the same thing, and it's preinstalled on GitHub Actions runner images
    skopeo copy "docker://$SOURCE" "docker://$DEST"
    IMAGE_ID=$(skopeo inspect --format "{{ .Digest }}" "docker://$DEST")
  else
    echo "Warning: regctl is not installed. regctl makes Railpack image transfers much faster when images have not changed since the last run. Using standard \`docker pull\` + \`docker push\` instead."
    TAG=$(docker pull -q "$SOURCE")
    docker tag "$TAG" "$DEST"
    docker push "$DEST"
    IMAGE_ID=$(docker image inspect "$DEST" | jq -r '.[0].Id')
  fi

  IMAGE_REF="$DEST@$IMAGE_ID"
  set_value "$VALUES_FILE" "$KEY" "$IMAGE_REF"
  echo "- \`$IMAGE_REF\`" >> "$NOTES_FILE"
}

RAILPACK_VERSION=$(cat "$PROJECT_ROOT/builders/railpack/Dockerfile" | grep "RAILPACK_VERSION=" | cut -d= -f 2)
RAILPACK_RELEASE_SHA=$(gh api "repos/railwayapp/railpack/commits/v$RAILPACK_VERSION" --jq '.sha')

get_railpack_image_tag() {
  # Railpack container images are only published when their respective Dockerfiles and GH Actions workflows are updated, and they're only tagged with their current commit hashes.
  # If we want to get the fully-qualified (i.e. non-`latest`) image tag given a version number, we need to search for the most recently-published container image before the creation date of the release.
  
  CANDIDATES=()
  for FILE in "$@"; do
      # Fetch the single most recent commit for this file relative to the Release SHA
      COMMIT_DATA=$(gh api "repos/railwayapp/railpack/commits?path=$FILE&sha=$RAILPACK_RELEASE_SHA&per_page=1" \
          --jq '.[0] | {sha: .sha, date: .commit.committer.date}')
      
      if [ "$COMMIT_DATA" != "null" ]; then
          CANDIDATES+=("$COMMIT_DATA")
      fi
  done

  # Sort candidates by date and pick the last (most recent) one
  SHA=$(printf '%s\n' "${CANDIDATES[@]}" | jq -s -r 'sort_by(.date) | last | .sha')

  echo "sha-$SHA"
}

build_images() {
  echo "### Container Images" >> "$NOTES_FILE"

  build_and_push "Dockerfile" "" ".anvilops.image" "$REGISTRY_BASE/anvilops"
  build_and_push "backend/prisma/Dockerfile" "backend" ".anvilops.dbMigrateImage" "$REGISTRY_BASE/migrate-db"
  build_and_push "filebrowser/Dockerfile" "filebrowser" ".anvilops.env.fileBrowserImage" "$REGISTRY_BASE/file-browser"
  build_and_push "builders/dockerfile/Dockerfile" "builders/dockerfile" ".anvilops.env.dockerfileBuilderImage" "$REGISTRY_BASE/dockerfile-builder"
  build_and_push "builders/railpack/Dockerfile" "builders/railpack" ".anvilops.env.railpackBuilderImage" "$REGISTRY_BASE/railpack-builder"
  build_and_push "builders/helm/Dockerfile" "builders/helm" ".anvilops.env.helmDeployerImage" "$REGISTRY_BASE/helm-deployer"
  build_and_push "log-shipper/Dockerfile" "log-shipper" ".anvilops.env.logShipperImage" "$REGISTRY_BASE/log-shipper"
}


copy_railpack_images() {
  # Copy Railpack images to our own registry to pin the versions and remove runtime dependency on GitHub
  RAILPACK_INTERNAL_FRONTEND_IMAGE="$REGISTRY_BASE/railpack-frontend:$RAILPACK_VERSION"
  RAILPACK_INTERNAL_BUILDER_IMAGE="$REGISTRY_BASE/railpack-builder:$RAILPACK_VERSION"
  RAILPACK_INTERNAL_RUNTIME_IMAGE="$REGISTRY_BASE/railpack-runtime:$RAILPACK_VERSION"

  copy_image ".anvilops.env.railpackInternalFrontendImage" "ghcr.io/railwayapp/railpack-frontend:v$RAILPACK_VERSION" "$RAILPACK_INTERNAL_FRONTEND_IMAGE"
  copy_image ".anvilops.env.railpackInternalBuilderImage" "ghcr.io/railwayapp/railpack-builder:$(get_railpack_image_tag "images/debian/build/Dockerfile" ".github/workflows/publish-builder.yml")" "$RAILPACK_INTERNAL_BUILDER_IMAGE"
  copy_image ".anvilops.env.railpackInternalRuntimeImage" "ghcr.io/railwayapp/railpack-runtime:$(get_railpack_image_tag "images/debian/runtime/Dockerfile" ".github/workflows/publish-runtime.yml")" "$RAILPACK_INTERNAL_RUNTIME_IMAGE"
}

publish_chart() {
  set_value "$CHART_FILE" ".version" "$VERSION"

  CHART_PACKAGE_DIR=$(mktemp -d)

  helm package --destination "$CHART_PACKAGE_DIR" "$CHART_DIR"
  CHART_PACKAGE_FILE="$CHART_PACKAGE_DIR/$(ls "$CHART_PACKAGE_DIR")"

  helm push "$CHART_PACKAGE_FILE" "$HELM_ARTIFACT_TAG"
  rm -rf "$CHART_PACKAGE_DIR"

  cat << EOF >> "$NOTES_FILE"

### Install with Helm
\`\`\`sh
helm install anvilops --version $VERSION $HELM_ARTIFACT_TAG/anvilops
\`\`\`
EOF
}

generate_github_release() {
  if [ -v GENERATE_GITHUB_RELEASE ]; then
    git add "$VALUES_FILE" "$CHART_FILE"
    git commit -m "Release version $VERSION"
    git push
    gh release create --draft --generate-notes --notes-file "$NOTES_FILE" --title "v$VERSION" "v$VERSION"
  else
    echo "Skipping GitHub release."
    # Undo the changes we made to the chart since they're not going to be saved anywhere
    cp "$BACKUP_DIR/values.yaml" "$VALUES_FILE"
    cp "$BACKUP_DIR/Chart.yaml" "$CHART_FILE"
  fi
}

build_images
copy_railpack_images
publish_chart
generate_github_release

echo ""
cat "$NOTES_FILE"
