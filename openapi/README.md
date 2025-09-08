# AnvilOps OpenAPI Spec

## Install Packages

```sh
npm install
```

## Generate Client Code

```sh
npm run generate
```

Output will be placed in `frontend/src/generated/openapi` and `backend/src/generated/openapi.ts`.

Note: in the project-wide `Dockerfile`, both code generation tools are installed separately without using the `package.json` in this directory.
Therefore, when updating versions, make sure to update them in the Dockerfile as well.
