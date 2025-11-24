# This Dockerfile is used to build the AnvilOps backend for use with Tilt.
# It's used instead of the main anvilops image because it's much smaller and faster to build.
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

# BACKEND: remove devDependencies before node_modules is copied into the final image
FROM backend_deps AS backend_prod_deps
WORKDIR /app
RUN npm prune --omit=dev

# BACKEND: generate Prisma client
FROM base AS backend_codegen

WORKDIR /app
COPY --from=backend_deps /app/node_modules ./node_modules
COPY backend/package*.json .
COPY backend/prisma ./prisma
RUN npm run prisma:generate

# Run the backend
FROM base AS backend_run

WORKDIR /app
COPY --from=regclient/regctl:v0.9.2-alpine /usr/local/bin/regctl /usr/local/bin/regctl
COPY --from=backend_prod_deps /app/node_modules ./node_modules
COPY templates/templates.json ./templates.json
COPY --from=backend_codegen /app/src/generated/prisma/ ./src/generated/prisma
COPY openapi/*.yaml /openapi/
COPY --from=openapi_codegen /app/backend/src/generated/openapi.ts ./src/generated/openapi.ts
COPY backend/ .

CMD ["npm", "run", "start:prod"]
