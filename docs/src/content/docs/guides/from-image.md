---
title: First Image Deployment
sidebar:
  order: 2
---

AnvilOps can deploy apps from publicly accessible container images.
This tutorial will demonstrate:

- How to deploy an application from a preexisting container image.

### Getting started

1. Click the Create App button on the AnvilOps dashboard.
   ![Create App buttons](./tutorial/create-app-buttons.png)

2. After selecting an Organization (and a Rancher project), select `OCI Image` as the Deployment Source.

3. Enter a container image. The image reference should look like `REGISTRY/NAMESPACE/REPOSITORY:TAG`.

   If you are deploying an image available on Docker Hub, you can omit the host. If the image is a Docker Official image, you can omit the repository as well. However, it's strongly advised to use Anvil's [Docker Hub cache](https://www.rcac.purdue.edu/knowledge/anvil/composable/registry#_using_the_anvil_registry_docker_hub_cache) instead.

   Some example container image references:

   - `registry.anvil.rcac.purdue.edu/anvilops/foo:bar`
     - Host: `registry.anvil.rcac.purdue.edu`
     - Namespace: `anvilops`
     - Image: `foo`
     - Tag: `bar`
   - `nginx:1.28-alpine`
     - Host: `docker.io` (default)
     - Namespace: `library` (default)
     - Repository: `nginx`
     - Tag: `1.28-alpine`

### Deployment options

4. Select a unique subdomain for your app. Your app will be made publicly accessible at `https://<subdomain>.anvilops.rcac.purdue.edu`.

5. Enter the port number your application listens on. Kubernetes will route requests to `https://<subdomain>.anvilops.rcac.purdue.edu` to this port for your applications to process.

6. Add any environment variables your app requires. Environment variables can be marked as sensitive. Sensitive environment variables cannot be viewed after they are set, although they can be updated.

7. If your app requires storage that persists across restarts, configure volume mounts. Make sure to select an appropriate path and storage limit— these values cannot be changed later. See the [PostgreSQL database tutorial](/guides/deploying-a-database) for an example.
