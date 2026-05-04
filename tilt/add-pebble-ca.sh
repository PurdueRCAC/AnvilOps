#!/bin/bash
set -e

# This script adds Pebble's CA certificate to the root-ca-cert Kubernetes Secret.
# We need to do this because Pebble runs on HTTPS only, and it uses a self-signed certificate.
# Without running this script, AnvilOps won't trust it, which will prevent it from generating certificates.

# You only need to run this script if you're using Pebble to test generating certificates for custom domains in a local
# development environment. In production, you should use a real ACME server, which should be trusted by a common root CA.

# After running this script, set `withRootCaCert` to `true` in `local-values.yaml`.
# If you're using Tilt, this last step will be done for you if you've set `enable_pebble` to `True` in the `Tiltfile`.

SECRET_NAME="root-ca-cert"
NEW_CERT_FILE="pebble.minica.pem"
DATA_KEY="tls.crt"

CWD="$(pwd)"
cd "$(mktemp -d)"

wget "https://raw.githubusercontent.com/letsencrypt/pebble/refs/heads/main/test/certs/pebble.minica.pem"

EXISTING_DATA="$(kubectl get secret "$SECRET_NAME" --ignore-not-found -o jsonpath="{.data['$DATA_KEY']}")"

if [ -n "$EXISTING_DATA" ]; then
  echo "$EXISTING_DATA" | base64 --decode > combined_chain.pem
  # Add a newline to ensure the next cert starts on a new line
  echo "" >> combined_chain.pem
else
  # No existing certificate in the secret; start from a blank file
  touch combined_chain.pem
fi

# Append the new cert to the chain
cat "$NEW_CERT_FILE" >> combined_chain.pem

kubectl create secret generic "$SECRET_NAME" \
  --from-file="$DATA_KEY"=combined_chain.pem \
  --dry-run=client -o yaml | kubectl apply -f -

cd "$CWD"