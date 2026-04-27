#!/bin/bash

if [[ $# < 1 ]]; then
  echo "Usage: $0 path/to/Chart.yaml";
  exit 1;
fi

tmp="$(mktemp -d)"

yq '.annotations."anvilops-values"' "$1" > "$tmp/anvilops-values.json"

npx ajv test -s anvilops-values-schema.json -d "$tmp/anvilops-values.json" --valid --spec=draft2020

status=$?

rm -r "$tmp"

exit $status