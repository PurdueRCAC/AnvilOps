#!/bin/bash
set -uo pipefail


CURRENT_DIR=$(dirname "$0")
TEMPLATE_DIR="$PWD/$CURRENT_DIR/../../../charts/templates"
cd $TEMPLATE_DIR || exit 1

tmp="$(mktemp -d)"

status=0

shopt -s nullglob
for template in *; do
  if [[ -d "$template" && -f "$template/Chart.yaml" ]]; then
    echo "Validating $template"
    yq '.annotations."anvilops-values"' "$template/Chart.yaml" > "$tmp/$template-values.json"
    if ! npx ajv test \
      -s anvilops-values-schema.json \
      -d "$tmp/$template-values.json" \
      --valid \
      --spec=draft2020 \
      > /dev/null; then
      status=1
    fi
  fi
done
shopt -u nullglob

exit $status