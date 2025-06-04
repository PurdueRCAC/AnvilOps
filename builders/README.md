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

You will also need to create a secret called `buildkit-daemon-certs` which must contain keys named (`ca.pem`, `cert.pem`, and `key.pem`) or (`ca.crt`, `tls.crt`, `tls.key`).
