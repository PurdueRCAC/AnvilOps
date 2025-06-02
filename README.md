# AnvilOps

## Local Development Setup

```sh
cd openapi
npm install
npm run generate

cd ../frontend
npm install

cd ../backend
npm install
npm run prisma:generate
```

## Kubernetes Cluster Setup

Follow the instructions in `infra/README.md`.
