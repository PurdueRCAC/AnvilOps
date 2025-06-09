#!/bin/bash
set -eo pipefail

rm -r ./generated
mkdir -p ./generated
chmod -R 777 ./generated

STEP="docker run --rm -it -v ./generated:/home/step/certs -w /home/step/certs smallstep/step-cli"

# https://www.joshkasuboski.com/posts/buildkit-builder/

$STEP step certificate create --no-password --insecure \
    --profile root-ca "Buildkit Root CA" \
    root_ca.crt root_ca.key

$STEP step certificate create "Buildkit Intermediate CA 1" \
    intermediate_ca.crt intermediate_ca.key \
    --profile intermediate-ca --ca ./root_ca.crt --ca-key ./root_ca.key \
    --no-password --insecure

$STEP step certificate create buildkitd --san buildkitd --san localhost --san 127.0.0.1 buildkitd.crt buildkitd.key \
    --profile leaf --not-after=8760h \
    --ca ./intermediate_ca.crt --ca-key ./intermediate_ca.key --bundle --no-password --insecure

$STEP step certificate create client client.crt client.key \
    --profile leaf --not-after=8760h \
    --ca ./intermediate_ca.crt --ca-key ./intermediate_ca.key --bundle --no-password --insecure

mkdir -p ./generated/buildkitd
mkdir -p ./generated/client

mv ./generated/buildkitd.key ./generated/buildkitd/key.pem
cp ./generated/root_ca.crt ./generated/buildkitd/ca.pem
mv ./generated/buildkitd.crt ./generated/buildkitd/cert.pem

mv ./generated/client.key ./generated/client/key.pem
mv ./generated/root_ca.crt ./generated/client/ca.pem
mv ./generated/client.crt ./generated/client/cert.pem

rm generated/intermediate_ca.* generated/root_ca.key