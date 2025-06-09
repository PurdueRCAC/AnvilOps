# AnvilOps

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

## Kubernetes Cluster Setup

1. Follow the instructions in `infra/README.md`.
2. Follow the instructions in `backend/README.md` to get credentials and create Kubernetes secrets for them.
3. Follow the instructions in `builders/README.md` to supply credentials for your image registry.
