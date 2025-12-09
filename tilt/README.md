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

2. Make sure you're in Tilt's Kubernetes context

   If you aren't, Tilt could start creating resources in a production cluster!

   ```sh
   kubectl config current-context
   ```

   Make sure this command outputs the name of your local cluster. If you aren't sure, check your kubeconfig (`kubectl config view`) and make sure the name corresponds to an address that starts with `localhost`.

3. Run Tilt:

   ```sh
   tilt up
   ```

   Make sure you run this command from the `tilt` directory in the AnvilOps project. If you run `ls`, you should be able to see the `Tiltfile`.

4. After waiting a few minutes, you should be able to access AnvilOps at http://localhost:3000 in your browser.

## Troubleshooting

### Database authentication errors

It's possible that a persistent volume wasn't deleted when recreating resources.
Try this:

```sh
# Make sure you're connected to your local development cluster and not a production cluster!
# This script is very destructive!
kubectl delete pv $(kubectl get pv -o template='{{range $item := .items}}{{if eq .spec.claimRef.name "db-data-anvilops-postgres-0"}}{{$item.metadata.name}}{{end}}{{end}}') &
kubectl delete pvc db-data-anvilops-postgres-0 &
kubectl delete sts anvilops-postgres
tilt trigger anvilops-postgres # Recreate the database
```

### BuildKit "context deadline exceeded" errors

If the image builder says "context deadline exceeded", that means it waited too long for the connection to the BuildKit Daemon to become active.
This probably means some other error is happening.

First, try restarting the BuildKit daemon. It's possible that the certificate creation job ran while the server was running, and it didn't pick up the new certificates. Then, when the build job tried to connect, the server rejected the client's certificates over and over until the maximum wait time was reached. You can restart it from the Tilt dashboard, or with the CLI (`tilt trigger anvilops-buildkitd` or `kubectl rollout restart deployment anvilops-buildkitd`).

If that doesn't fix the issue, try removing the `--wait` flag from the `buildctl` command. That should reveal a more useful error message.

### "no space left on device" errors

If you're seeing this message, Tilt has probably built hundreds of copies of the AnvilOps images and pushed them to its local registry on your computer.
This has likely used most or all of your disk space, causing this error.

Even if your disk isn't completely full, you may still see this error if your file system needs uses a separate chunk of space to store metadata (like `btrfs`) or
if your disk has reached its inode limit.

Here are a few ways to reclaim space. Try each one in order until the issue is resolved:

1. Remove unused images from within your local cluster

```
docker exec ctlptl-registry registry garbage-collect -m /etc/docker/registry/config.yml
docker exec kind-control-plane crictl rmi --prune
```

2. Recreate Tilt resources: `tilt down && tilt up`
3. Prune on your system: `docker system prune -a`
4. Recreate your development cluster: `docker system prune -a --volumes && ctlptl delete cluster kind-kind && docker rm -f ctlptl-registry && ctlptl create cluster kind --registry=ctlptl-registry`

Similar error messages could also appear if you've hit your open file limit. Follow [these instructions](https://kind.sigs.k8s.io/docs/user/known-issues/#pod-errors-due-to-too-many-open-files) to resolve that issue.
