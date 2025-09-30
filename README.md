<img alt="AnvilOps" src="./docs/src/assets/anvilops.png" width="200" />

---

AnvilOps is a platform-as-a-service that automates the process of building container images and deploying them in a Kubernetes cluster. It integrates with [Railpack](https://railpack.com/) for zero-configuration image building and GitHub for CI/CD.

It was created at Purdue University's [Rosen Center for Advanced Computing](https://www.rcac.purdue.edu/), but it is designed to run on any Kubernetes cluster managed by Rancher.

## Local Development Setup

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

Follow the instructions in the `backend` README to create credentials and set environment variables for them in `backend/.env`.

### Local Kubernetes Cluster

Follow the instructions in the [Tilt setup guide](./tilt/README.md) to run a local development cluster that automatically rebuilds and redeploys every component of AnvilOps when the relevant source files change.

**This is the recommended way to develop AnvilOps** because it emulates a production environment closely enough without slowing down the development process.

## Remote Kubernetes Cluster Setup

1. Follow the instructions in `infra/README.md`.
2. Follow the instructions in `backend/README.md` to get credentials and create Kubernetes secrets for them.
3. Follow the instructions in `builders/README.md` to supply credentials for your image registry.
