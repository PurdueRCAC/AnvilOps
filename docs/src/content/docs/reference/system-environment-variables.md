---
title: System Environment Variables
sidebar:
  order: 5
---

AnvilOps provides some environment variables in addition to the ones you specify based on your project's settings. These variables are available at build time and at runtime.

### `PORT`

The port that your app is configured to run on.

### `ANVILOPS_CLUSTER_HOSTNAME`

The hostname that your app is accessible at inside the Kubernetes cluster. This is not a public hostname. This variable does not include the protocol at the beginning (e.g. `https://`) or a port number at the end.

### `ANVILOPS_APP_NAME`

The display name of your application that you see in the dashboard.

### `ANVILOPS_SUBDOMAIN`

The subdomain portion of your app's full URL. For example, if your app is available at `https://myapp.anvilops.rcac.purdue.edu`, `ANVILOPS_SUBDOMAIN` will be `myapp`.

### `ANVILOPS_APP_ID`

The AnvilOps app ID that is currently building or running.

### `ANVILOPS_DEPLOYMENT_ID`

The ID of the AnvilOps deployment that is currently building or running. Every new deployment gets its own unique deployment ID.

### `ANVILOPS_DEPLOYMENT_SOURCE`

Will be set to either `GIT` or `IMAGE`, depending on whether your app is configured to deploy from a Git repository or an OCI image.

### `ANVILOPS_IMAGE_TAG`

The full tag of the image that AnvilOps is using to run your app.

### `ANVILOPS_HOSTNAME`

The public hostname that your app is accessible at. This hostname is accessible to anyone over the internet. This variable does not include the protocol at the beginning (e.g. `https://`) or a port number at the end.

### `ANVILOPS_URL`

The same as ANVILOPS_HOSTNAME but formatted as a full URL with a protocol.

## Git-only options

### `ANVILOPS_REPOSITORY_ID`

The ID of the GitHub repository that the project is linked to.

### `ANVILOPS_REPOSITORY_OWNER`

The name of the owner of the Git repository linked to the app.

### `ANVILOPS_REPOSITORY_NAME`

The name of the Git repository linked to the app.

### `ANVILOPS_REPOSITORY_SLUG`

The repository's owner, followed by a forward slash (/), followed by its name.

### `ANVILOPS_COMMIT_HASH`

The commit SHA that triggered this deployment's build.

### `ANVILOPS_COMMIT_MESSAGE`

The commit message that triggered this deployment's build.
