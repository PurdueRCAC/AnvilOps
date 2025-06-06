# AnvilOps Builders

This directory contains strategies for building containers from a repository.

## Kubernetes Setup

To access private registries, you will need to provide credentials.

They should be in the same format as your `~/.docker/config.json`, so they will look something like this:

```json
{
  "auths": {
    "registry.anvil.rcac.purdue.edu": {
      "auth": "<base64-encoded username and password>"
    }
  }
}
```

The easiest way to do this is to use `docker login` on your machine. Then, look at your `~/.docker/config.json`. Copy it to a new file, remove any entries you don't want, and then create a secret with the file:

```sh
kubectl create secret generic registry-credentials --from-file=config.json=/path/to/docker-config.json
```

You will also need to create two secrets: one called `buildkit-daemon-certs` and the other `buildkit-client-certs`. Both must contain keys named (`ca.pem`, `cert.pem`, and `key.pem`) or (`ca.crt`, `tls.crt`, `tls.key`).

You can run this script to create or refresh your certificates. `generate-certs.sh` creates certificates that are valid for one year.

```sh
# Run these commands from the `builders/certs` directory

./generate-certs.sh

NAMESPACE=anvilops-dev # <-- Fill this in with your K8s namespace

kubectl -n $NAMESPACE delete secret buildkit-daemon-certs
kubectl -n $NAMESPACE delete secret buildkit-client-certs

kubectl -n $NAMESPACE create secret generic buildkit-daemon-certs --from-file=ca.pem=generated/buildkitd/ca.pem --from-file=cert.pem=generated/buildkitd/cert.pem --from-file=key.pem=generated/buildkitd/key.pem
kubectl -n $NAMESPACE create secret generic buildkit-client-certs --from-file=ca.pem=generated/client/ca.pem --from-file=cert.pem=generated/client/cert.pem --from-file=key.pem=generated/client/key.pem
```
