# AnvilOps Contributors' Guide

This document contains a list of things you'll want to know before contributing to AnvilOps. Before you read this document, check out [README.md](./README.md), and if you still have questions after reading this document, they may be addressed in the individual subproject READMEs (e.g. [backend/README.md](./backend/README.md)).

## Philosophy

### Goals

- Ease-of-use: Make software really easy to deploy on Kubernetes.
- Abstraction: Abstract away Kubernetes-specific details and concepts so that the user doesn't need any Kubernetes background knowledge.
- Portability: People should be able to install AnvilOps on any Kubernetes cluster, without depending on Purdue-specific or proprietary components.
  - This means users should easily be able to leave AnvilOps, and AnvilOps shouldn't store any configurations in the user's repositories.
  - AnvilOps should also be quick and easy to install, which is why it's distributed as a Helm chart with most of the necessary dependencies included.
- Security: AnvilOps should defend against accidental misuse, but because we value portability and simplicity, it probably can't protect against adversarial users. It's intended for private use among trusted users. However, this does not mean security isn't a priority. Things like tenant isolation and best-effort protections like rate limits and build timeouts are still very important.
  - AnvilOps's container images should be minimal, containing only the necessary tools to run the service. In production, we use distroless images to minimize attack surface because they don't contain things like shells or debugging tools.
  - Run user code in separate namespaces in isolated containers
  - Use network policies to limit data exfiltration
- Developer-friendliness: the AnvilOps development environment should be very easy to set up, and as much of the setup as possible should be automated. Currently, once Tilt is installed and a local K8s cluster is running, it's just `tilt up` plus a few required environment variables.

### Non-goals

- Lock users into the platform with nonstandard configurations or special features that don't map to standard Kubernetes configurations
- Make everyone's use case work on the platform - AnvilOps is designed to fit _most_ use cases, which are typically quite simple

## Common Tasks

As a maintainer, you should periodically perform the following tasks:

### Update Railpack

Railpack is the system that AnvilOps uses to build users' applications without Dockerfiles. It chooses a build template based on the files in the repo and generates build instructions that BuildKit can use to build an image.

As it improves support for languages and frameworks, it should be updated to give users those benefits.

You can check the current version by [visiting the project page on GitHub](https://github.com/railwayapp/railpack/releases) or via the GitHub CLI:

```sh
gh release view --repo railwayapp/railpack --json tagName --jq '.tagName'
```

Copy the current version number to the first line of `builders/railpack/Dockerfile`. Before pushing the change to `main`, make sure a Railpack build works as expected from the UI.

Note: Railpack requires a few container images to execute the builds that it configures. AnvilOps vendors these images during a release, so the version number in that Dockerfile is used to pull the latest Railpack images from GitHub Packages and push them to the same place that the AnvilOps images live. See the `copy_railpack_images` function in `.github/workflows/release/release.sh`. If Railpack pushes a change that modifies the way these images are used, the logic there or in `builders/railpack/docker-entrypoint.sh` may need to be adjusted.

### Address Security Alerts

On every push, we have Trivy check the repository for security issues in a GitHub Actions workflow. If any are found, the check will fail.

Most of these issues come from Node.js packages, and they usually can be addressed via `npm audit fix`:

```sh
cd frontend
npm audit fix

cd ../backend
npm audit fix

cd ./regclient-napi
npm audit fix

cd ../../filebrowser
npm audit fix

# These last three are just used to generate TypeScript types and HTML, so it's highly unlikely that detected vulnerabilities can actually be exploited
cd ../openapi
npm audit fix

cd ../swagger-ui
npm audit fix

cd ../docs
npm audit fix
```

Of course, most of these security issues are in code paths that AnvilOps doesn't exercise, but it's still a good practice to find 0 CVEs on a security scan.

## Updates We're Waiting On

Here are a few things that we'd like to do, but we're waiting on external packages to update first:

### Node.js 26

Node 26 will become LTS (long-term support) in October 2026. When this happens, you can:

- Remove the `es-arraybuffer-base64` package (which is a polyfill for `Uint8Array.prototype.toBase64`) and the relevant portion of `backend/patches/@fishballpkg+acme+0.15.0.patch`. This patch was created with `patch-package`, so the best way to edit it is by editing the package source code and running `npx patch-package @fishballpkg/acme`.
- Consider adopting the new `node:ffi` module instead of using Node-API for the `regclient-napi` package. This could make the integration a lot simpler and remove the reliance on a C++ compiler (although, [Go's ABI](https://go.dev/src/cmd/compile/abi-internal) is unstable, so CGo will probably still be required).

### Oxlint and Oxfmt

We currently use ESLint and Prettier for linting and formatting. These tools are standard, but Oxlint and Oxfmt (see their [website](https://oxc.rs/)) have recently become generally available. Switching to Oxlint should improve CI pipeline times, and switching to Oxfmt should make auto-formatting a bit faster.

Oxlint should be easy to adopt except the `eslint-plugin-boundaries`, which doesn't natively support it yet.

### TypeScript 7

Be sure to upgrade to TypeScript 7 when it's released. The team rewrote the compiler in Go for a ~10x speedup, which will shave a few seconds off image builds.

### Rancher >2.12

Since version 2.12, Rancher can be used as a standalone OIDC provider, so the logic mapping OAuth users to Rancher users can be removed (see `getPrincipalIdValue` in `src/service/auth.ts`). Rancher 2.12 was released in July 2025, but Purdue's Anvil and Geddes clusters hasn't adopted it yet, so we still need to maintain support for a separate auth provider. When Rancher is upgraded on the Purdue clusters, everything related to CILogon can be removed, and Rancher can be the exclusive auth provider for AnvilOps.

### Kubernetes 1.36

Kubernetes 1.36 enables user namespaces by default (see [this article](https://kubernetes.io/blog/2026/04/23/kubernetes-v1-36-userns-ga/) for more info). When it becomes feasible (i.e. when the Linux kernel and Kubernetes are updated and the host machines are configured properly), user namespaces should be enabled by default for the BuildKit deployment that AnvilOps ships with. This should significantly reduce the attack surface after a container escape vulnerability is exploited.

Kubernetes 1.36 also enables image volumes by default. This means the log shipper can be loaded from an image volume instead of using an `initContainer` to copy the binary into a shared volume with the user's main container. See `log-shipper/README.md` and `backend/src/service/common/cluster/resources/logs.ts`.

## Testing and Static Analysis

On every push, a script runs in a GitHub Actions workflow to lint all of the subprojects in the repository (`.github/workflows/lint/lint.sh`). This check should pass on a pull request before it is merged, and any new linters should be added to this script. It runs `shellcheck` for shell script, `golangci-lint` for the log shipper and regclient-napi packages, `hadolint` for Dockerfiles, and ESLint for the frontend and backend.

On the backend, we have `vitest` set up for unit tests; however, we're at basically 0% coverage. As you add new features or fix bugs, it would be wise to add tests that would have failed before your change and succeed after implementing your change. These tests can use a PGlite database (an in-memory version of Postgres). Every call to `backend/test/util/db.ts` creates a new instance of the common `Database` interface that's backed by a new, empty database, perfect for testing.

The Dockerfiles also run `tsc`, the TypeScript type checker. On the backend, we started with a pretty loose TypeScript configuration that allowed many things that should have caused type errors. Eventually, `strictNullChecks` in `backend/tsconfig.json` should be set to `true`, and the type errors it causes should be fixed.

If you want to set up end-to-end tests, consider running them in Tilt with [`tilt ci`](https://docs.tilt.dev/ci.html). You can rely on Tilt to set up the environment, and then create a K8s `Job` that runs a custom image that uses `vitest` to run some tests (make sure the `Job` is only created when the user wants to run the tests, and that test dependencies never make it into the main image). Then, you can create a GitHub Actions workflow to run `tilt ci` on pushes and pull requests. This is a great way to smoke-test the whole system before deploying a change. If any of the resources fails (including the testing Job), then `tilt ci` will exit with a nonzero status code, which can be used to mark a CI check as failed.

I (@FluxCapacitor2) started this process in [#7](https://github.com/PurdueRCAC/AnvilOps/pull/7/commits), but it was abandoned because other feature work was more important at the time.

## OpenAPI

AnvilOps uses an OpenAPI specification to define the expected request and response types for every API endpoint. It's located at `openapi/openapi.yaml`.

Whenever you modify it, you need to run `npm run generate` in the `openapi` directory (you may need to run `npm install` first). This will regenerate the TypeScript types based on the new contents of the specification.

## Environments

### Local (Tilt)

When you're developing AnvilOps, you'll be running it in Tilt. Tilt is a tool that makes it easy to sync local changes to a Kubernetes cluster while handling things like image builds and configuration changes. Follow the instructions in [tilt/README.md](./tilt/README.md) to get started. Once your Tilt environment is ready, making a change to a source file should automatically trigger a rebuild and restart.

### Releases

This repository has a script to create a release of AnvilOps. A release includes all the container images and Helm charts required to deploy AnvilOps, including a vendored version of Railpack. To run these scripts, you'll need to set some environment variables, which are documented in a comment at the top of the file. After the script finishes publishing the release, it'll print out some installation instructions, which are also added to the GitHub release if one is created.

## How do I...

### ...Add a new API endpoint?

Follow [these instructions](./backend/README.md#adding-a-new-api-handler) in backend/README.md.

### ...Add a new page on the frontend?

We're using React Router. The routes are registered in `frontend/src/App.tsx`.

When you add a new page, you'll probably need to fetch some data. Check out the query client (the `api` constant) in `frontend/src/lib/api.ts`. It provides a type-safe way to access the API based on the generated TypeScript types that come from the OpenAPI spec.

### ...Modify the K8s manifest generation?

Look at:

- `backend/src/service/common/cluster/resources.ts`: Generating the manifests
- `backend/src/service/common/deployment.ts`: Invoking the manifest generation, invoking the K8s client to apply them to the cluster
- `backend/src/service/common/cluster/kubernetes.ts`: The Kubernetes API client

### ...View API docs?

Visit `/openapi` on a production deployment of AnvilOps, or start up the Tilt environment and run `npm run dev` from the `swagger-ui` directory.

This is Swagger UI, which is auto-generated API documentation from our OpenAPI spec. The specification itself is located at `openapi/openapi.yaml`.

## Backend: Architectural Boundaries

On the backend, we've drawn some boundaries to keep the codebase less tangled and easier to test. Check out [the relevant section in backend/README.md](./backend/README.md#project-structure) for more details.

These boundaries are enforced using the `eslint-plugin-boundaries` ESLint plugin. This is checked on every push with the lint GitHub Actions workflow. You may need to modify these boundaries for specific edge cases. You can do so from `backend/eslint.config.js`.

## Areas for Improvement

Here are a few things that I view as flaws with AnvilOps. They are good starting points for new development.

1. AnvilOps can only provide hostnames for services that use HTTP. It doesn't support TCP or UDP services.

   - Users may want this for things like databases, cache services, file servers, or other specialized apps.
   - Currently, users need to work around this by creating a LoadBalancer Service manually.

2. AnvilOps pushes all user images to the same Harbor project.

   - This means an AnvilOps user could run an image created by another AnvilOps user if they knew the full tag name.
   - We allowed this because we wanted to avoid a dependency on a particular image registry (e.g. Purdue uses Harbor). However, the increase in security is probably worth the decrease in portability.

3. AnvilOps does not encrypt in-cluster traffic between the API server and the pods it creates.

   - We did this for simplicity; generating and rotating certificates adds extra moving parts to a deployment, and we didn't want to rely on an external operator like cert-manager. This should probably be an opt-in feature.
   - Traffic between the ingress controller and the end user (e.g. someone using the dashboard) _is_ encrypted; this is referring to connections between the API server and the log exporter (`log-shipper/main.go`) and builders (`builder/*/docker-entrypoint.sh`)

4. AnvilOps does not allow users to change the startup command or attach to their containers to execute commands

   - These features would make it much easier for users to debug their apps and perform tasks like running database migrations. Users can work around these by building a custom image with a specific startup command and by running `kubectl exec` manually, respectively.

5. AnvilOps does not create preview environments from GitHub pull requests

   - Many PaaS providers watch for pull requests and create a copy of the production environment that deploys the pull request's contents. Then, when the pull request is closed or merged, the associated infrastructure is deleted. This is a nice convenience. Users can work around this by creating a new app for each branch and deleting it manually.

6. AnvilOps does not allow users to deploy from a tarball or set of files that aren't in a GitHub repository

   - Users with more advanced needs may want to upload files directly to AnvilOps and then have the platform handle the image build, push, and deployment. This use-case currently isn't supported. They can work around this by building the image themselves, but they need access to a container registry to host their images.

7. AnvilOps does not allow users to edit volume configurations after an app has been created

   - If a user needs to change the size of their volumes or add new ones, they need to create a new app and handle the data migration manually.
   - Editing volumes is tricky in Kubernetes. Decreasing a volume's size seems to be impossible, and increasing it [is supported with limitations](https://kubernetes.io/blog/2022/05/05/volume-expansion-ga/).
