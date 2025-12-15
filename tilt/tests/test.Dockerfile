# This Dockerfile is used to build the AnvilOps backend with automated tests.

FROM node:24-alpine AS base

# Generate TypeScript types from OpenAPI spec
FROM base AS openapi_codegen

WORKDIR /app/openapi
COPY openapi/package*.json .
RUN npm ci --ignore-scripts
COPY openapi/*.yaml .
RUN npm run generate

# BACKEND: install dependencies
FROM base AS backend_deps

WORKDIR /app
COPY backend/package*.json .
COPY backend/patches/ ./patches
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts && npm run postinstall

# BACKEND: generate Prisma client
FROM base AS backend_codegen

WORKDIR /app
COPY --from=backend_deps /app/node_modules ./node_modules
COPY backend/package*.json .
COPY backend/prisma ./prisma
RUN npm run prisma:generate

# Run the backend
FROM base AS backend_run

EXPOSE 3000

WORKDIR /app
COPY --from=regclient/regctl:v0.11.1-alpine /usr/local/bin/regctl /usr/local/bin/regctl
COPY --from=backend_deps /app/node_modules ./node_modules
COPY templates/templates.json ./templates.json
COPY --from=backend_codegen /app/src/generated/prisma/ ./src/generated/prisma
COPY openapi/*.yaml /openapi/
COPY --from=openapi_codegen /app/backend/src/generated/openapi.ts ./src/generated/openapi.ts
COPY backend/ .
