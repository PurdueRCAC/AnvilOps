# Tilt Development Environment

[Tilt](https://tilt.dev) is a development tool that automates creating and updating Kubernetes resources when source files are changed.

- When you make a change to the Helm chart, it will be applied to the cluster immediately
- When you make a change to the application code, a new image will be built and the deployment manifests will be updated to point to the new image
- You can view logs from every component on the Tilt dashboard (http://localhost:10350/)
- The Tilt dashboard also has refresh/restart buttons for each component
- Secrets are created automatically from the `backend/.env` file and your current kubeconfig

## Setup

1. Install Tilt: https://docs.tilt.dev/install.html

   If you don't have an existing cluster, make sure you follow the instructions for creating a local cluster.

   It's probably easier to create a new cluster using Tilt's instructions because Tilt needs to be able to access a local registry that the guide will help you create.

2. Run Tilt:

   ```sh
   tilt up
   ```

   Make sure you run this command from the `tilt` directory in the AnvilOps project. If you run `ls`, you should be able to see the `Tiltfile`.

## Troubleshooting

### Database authentication errors

It's possible that a persistent volume wasn't deleted when recreating resources.
Try this:

```sh
# Make sure you're connected to your local development cluster and not a production cluster!
# This script is very destructive!
kubectl delete pv $(kubectl get pv -o template='{{range $item := .items}}{{if eq .spec.claimRef.name "db-data-anvilops-postgres-0"}}{{$item.metadata.name}}{{end}}{{end}}')
kubectl delete pvc db-data-anvilops-postgres-0
kubectl delete sts anvilops-postgres
tilt down
tilt up
```
