#!/bin/bash
set -uo pipefail

tmp="$(mktemp -d)"

status=0

shopt -s nullglob
for template in *; do
  if [[ -d "$template" && -f "$template/Chart.yaml" ]]; then
    echo "Validating $template"
    yq '.annotations."anvilops-values"' "$template/Chart.yaml" > "$tmp/$template-values.json"
    if ! npx --yes ajv-cli@5 test \
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