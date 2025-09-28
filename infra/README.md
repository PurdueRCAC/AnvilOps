# infra

This directory contains FluxCD configurations to install the AnvilOps Helm chart in our production environment. These configurations ensure that AnvilOps resources align with their definitions in this directory, and that newly pushed images are redeployed immediately.

Three deployments have been defined here: `dev`, `anvil`, and `geddes`. When a commit is pushed to the `dev` branch of the GitHub repository, the `dev` deployment is updated. When a commit is pushed to the `main` branch, the `anvil` and `geddes` deployments are updated.

## Requirements

See [the Helm chart installation guide](/charts/anvilops/README.md) for more information on required dependencies and secrets.

## Setup

```
NAMESPACE=default

flux create secret git anvilops -n $NAMESPACE --url=ssh://git@github.rcac.purdue.edu/RCAC-Staff/AnvilOps
```

Add the resulting deploy key to the list of deploy keys on the repository. Next, follow [the Helm chart installation guide](/charts/anvilops/README.md).

Finally, run

```
kubectl apply -f infra/base/gitrepository.yaml
kubectl apply -f infra/dev/anvilops-infra.yaml
```
