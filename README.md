<p align="center">
  <img alt="AnvilOps" src="./docs/src/assets/anvilops.png" width="300" />
</p>

---

**AnvilOps** is a platform-as-a-service that automates the process of building container images and deploying them in a Kubernetes cluster. It integrates with [Railpack](https://railpack.com/) for zero-configuration image building and GitHub for CI/CD.

It was created at Purdue University's [Rosen Center for Advanced Computing](https://www.rcac.purdue.edu/), but it is designed to run on any Kubernetes cluster, with additional features for clusters managed by Rancher.

## Key Features

AnvilOps allows users to:

- Deploy apps from container images or GitHub repositories
- Automatically rebuild and redeploy apps when commits are pushed to a GitHub repository
- Build container images without Dockerfiles
- View container logs and statuses in realtime
- Browse files in persistent volumes from a web interface
- Create applications within the Rancher projects that they have access to
- Provision persistent volumes for application storage
- Access apps on automatically-provisioned public subdomains
- Easily rollback to prior deployment configurations
- Eject and begin managing Kubernetes resources manually

All of this can be done from a user-friendly web interface without deep knowledge of Kubernetes.

## Simplicity for Users and System Administrators

AnvilOps is designed to "just work" for the vast majority of use cases.

For end users:

- AnvilOps can build applications from a Dockerfile or infer configuration for [supported languages and frameworks](./docs/src/content/docs/reference/railpack.md).
- If an app is linked to a Git repository, changes to the default branch automatically trigger a new build and deployment.
- AnvilOps has user-friendly interfaces for viewing build and runtime logs and container statuses that update in realtime.
- If more flexibility is needed, the user can eject from AnvilOps at any time without shutting down their application.

For system administrators, deploying AnvilOps is as simple as installing a Helm chart. AnvilOps does not require any dependencies outside of the cluster and doesn't declare any CRDs.

## AnvilOps at Purdue

AnvilOps runs on Purdue's [Anvil](https://www.rcac.purdue.edu/anvil) and [Geddes](https://www.rcac.purdue.edu/compute/geddes) clusters:

- Anvil: https://anvilops.rcac.purdue.edu/
- Geddes: http://anvilops.geddes.purdue.edu/

## Security Considerations

AnvilOps is not designed for public use. Access to AnvilOps should only be shared with trusted users.

#### Applications

- End users' applications are deployed in separate namespaces.
- ~~By default, [network policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/) are created that prevent applications from communicating with other pods in the cluster. AnvilOps apps must be allowed to cross-communicate by placing them in the same App Group.~~ (WIP)
- For stronger isolation, consider using something like [Kata Containers](https://katacontainers.io/), which places containers into separate microVMs.

#### Secrets

- User-provided environment variables are encrypted at rest with AES-256-GCM using a key defined in a Kubernetes secret.

#### Builds

- By default, builds are run in a shared BuildKit pod with `privileged: true`. **This is an insecure default while we wait for rootless options to become more compatible.** In the event of a container escape vulnerability, attackers could escalate their privileges and take over the host system. If your Kubernetes and container runtime versions are recent enough, you should use [user namespaces](https://kubernetes.io/docs/concepts/workloads/pods/user-namespaces/) to avoid running the BuildKit daemon in privileged mode. For additional isolation, consider running the BuildKit daemon in a virtual machine outside the cluster.

#### Images

- Every container image built by AnvilOps is pushed to the same container registry with the same access controls. This means that apps can use images that were built for other apps. Secrets should not be included in container images.

#### Kubernetes API Interactions

- When Rancher support is enabled, AnvilOps users are mapped to corresponding Rancher users. When a user performs an action that requires a Kubernetes API call, like creating an app or viewing container statuses, that API call impersonates their Rancher user, ensuring they can only access resources they are allowed to access.
  - The list of users that AnvilOps is allowed to impersonate must be configured manually to avoid giving AnvilOps the ability to impersonate a user with administrator permissions.

## Local Development Setup

1. Follow the instructions in the `backend` README to create credentials and set environment variables for them in `backend/.env`.
2. Install packages and generate TypeScript types:

   ```sh
   npm install

   cd openapi
   npm install
   npm run generate

   cd ../frontend
   npm install

   cd ../backend
   npm install
   npm run prisma:generate

   cd ../swagger-ui
   npm install
   ```

3. Follow the instructions in the [Tilt setup guide](./tilt/README.md) to run a local development cluster that automatically rebuilds and redeploys every component of AnvilOps when the relevant source files change. We use Tilt because it emulates a production environment closely enough without slowing down the development process.

## Installation

### System Requirements

Installing AnvilOps requires that you have:

- An OAuth2 provider
- A GitHub App

...and a Kubernetes cluster with:

- A StorageClass (optional - used for user-created persistent volumes)
- An Ingress controller
- A container registry (optional - can be installed via the AnvilOps Helm chart)
- Rancher (optional)

### Install AnvilOps

AnvilOps is distributed as a Helm chart.

To install AnvilOps on a Kubernetes cluster for production use, follow the installation instructions in `charts/anvilops/README.md`.

## Project Structure

AnvilOps is a collection of many subprojects which build into a few container images.

| Image                         | Subproject(s)                                     | Deployed...                |
| ----------------------------- | ------------------------------------------------- | -------------------------- |
| `anvilops/anvilops`           | backend, frontend, openapi, swagger-ui, templates | Once                       |
| `anvilops/migrate-db`         | backend                                           | Once per Helm Chart update |
| `anvilops/app-proxy`          | infra/sandbox/proxy                               | Once                       |
| `anvilops/log-shipper`        | log-shipper                                       | Once per application       |
| `anvilops/dockerfile-builder` | builders/dockerfile                               | Once per build             |
| `anvilops/railpack-builder`   | builders/railpack                                 | Once per build             |
| `anvilops/file-browser`       | filebrowser                                       | On demand                  |

Every subproject has a `README.md` file with more information about its purpose and how to use it.

| Directory           | Purpose                                                          | Languages/Technologies                        |
| ------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `.github/workflows` | GitHub Actions workflows                                         | YAML                                          |
| `backend`           | The AnvilOps API server                                          | Node.js, TypeScript, Express                  |
| `builders`          | Container images used in build jobs                              | Bash                                          |
| `charts`            | The AnvilOps Helm chart                                          | YAML                                          |
| `docs`              | AnvilOps end user documentation                                  | Astro, HTML                                   |
| `filebrowser`       | A container image that powers the persistent volume file browser | Node.js, TypeScript                           |
| `frontend`          | The AnvilOps web dashboard and landing page                      | React, Vite, TypeScript, TailwindCSS          |
| `log-shipper`       | Sends logs from users' apps to the AnvilOps backend              | Go                                            |
| `openapi`           | OpenAPI spec                                                     | YAML                                          |
| `swagger-ui`        | Auto-generated API docs                                          |                                               |
| `templates`         | AnvilOps project templates displayed in the web UI               | JSON                                          |
| `tilt`              | Development environment configuration                            | Starlark (Python-like configuration language) |
