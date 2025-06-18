# infra

This directory contains configuration files for the Kubernetes resources used by AnvilOps.

### Requirements

Before deploying these manifests, add the following secrets in the `anvilops-dev` namespace:

1. `anvilops` - should contain a GitHub deploy key. You can use the Flux CLI to generate this: https://fluxcd.io/flux/installation/bootstrap/github/#github-deploy-keys
2. `webhook-token` - should contain a random string in a key called `token`. You should use the contents of this secret in the Authorization header of any Harbor webhook requests
3. `postgres-password` - should contain a random string in a key called `password`.
4. `tls-cert` - contains a signed TLS certificate(`.crt`) and a key(`.key`).
5. `cilogon-credentials` - contains a `client-id`, a `client-secret`, and a `session-secret` used during the authentication flow.
6. `app-config` - contains `project-name` and `project-ns`, the name and namespace of the Rancher project to group apps in.
7. `kube-auth` - contains a kubeconfig file under the key `kubeconfig`.
8. `logging-ingest-secret` - contains a random string in a key called `secret`.

### Logging

To store build and runtime logs from tenant pods, you will need to install the [Kubernetes logging operator](https://kube-logging.dev/). You can do so with Helm:

```sh
helm upgrade --install --wait --create-namespace --namespace logging logging-operator oci://ghcr.io/kube-logging/helm-charts/logging-operator
```

Then, follow [this guide](https://kube-logging.dev/docs/quickstarts/single/#configure-the-logging-operator) to create a `logging` resource (steps 1-3).
