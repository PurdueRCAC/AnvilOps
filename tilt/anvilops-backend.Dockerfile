FROM node:24 AS base

# Generate TypeScript types from OpenAPI spec
FROM base AS openapi_codegen

WORKDIR /app/openapi
COPY openapi/package*.json .
RUN npm ci
COPY openapi/*.yaml .
RUN npm run generate

# BACKEND: install dependencies
FROM base AS backend_deps

WORKDIR /app
COPY backend/package*.json .
COPY backend/patches/ ./patches
RUN --mount=type=cache,target=/root/.npm npm ci

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
COPY --from=backend_deps /app/node_modules ./node_modules
COPY templates/templates.json ./templates.json
COPY --from=backend_codegen /app/src/generated/prisma/ ./src/generated/prisma
COPY openapi/*.yaml /openapi/
COPY --from=openapi_codegen /app/backend/src/generated/openapi.ts ./src/generated/openapi.ts
COPY backend/ .

CMD ["npm", "run", "start:prod"]
