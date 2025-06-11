FROM node:24 AS base

# Generate TypeScript types from OpenAPI spec
FROM base AS openapi_codegen

WORKDIR /app/openapi
COPY openapi/package*.json .
RUN npm ci
COPY openapi/*.yaml .
RUN npm run generate

# FRONTEND: install dependencies
FROM base AS frontend_deps

WORKDIR /app
COPY frontend/package*.json .
RUN --mount=type=cache,target=/root/.npm npm ci

# FRONTEND: build for production
FROM base AS frontend_build

WORKDIR /app
COPY --from=frontend_deps /app/node_modules ./node_modules
COPY --from=openapi_codegen /app/frontend/src/generated ./src/generated
COPY frontend .

RUN npm run build

# BACKEND: install dependencies
FROM base AS backend_deps

WORKDIR /app
COPY backend/package*.json .
COPY backend/patches/ ./patches
RUN --mount=type=cache,target=/root/.npm npm ci

# BACKEND: generate Prisma client
FROM base AS backend_build

WORKDIR /app
COPY --from=backend_deps /app/node_modules ./node_modules
COPY backend/package*.json .
COPY backend/prisma ./prisma
RUN npm run prisma:generate

# SWAGGER UI: install packages and build
FROM base AS swagger_build
WORKDIR /app
COPY swagger-ui .
RUN npm ci
RUN npm run build

# Combine frontend & backend and run the app
FROM base AS backend_run

WORKDIR /app
COPY --from=swagger_build /app/dist ./public/openapi
COPY --from=frontend_build /app/dist ./public
COPY --from=backend_deps /app/node_modules ./node_modules
COPY openapi/*.yaml /openapi/
COPY --from=openapi_codegen /app/backend/src/generated/openapi.ts ./src/generated/openapi.ts
COPY --from=backend_build /app/src/generated/prisma ./src/generated/prisma
COPY backend .

RUN npx tsc --noEmit

CMD ["npm", "run", "start:prod"]
