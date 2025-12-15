# syntax=docker/dockerfile:1
FROM node:24-alpine AS base

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
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

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
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts && npm run postinstall

# BACKEND: remove devDependencies before node_modules is copied into the final image
FROM backend_deps AS backend_prod_deps
WORKDIR /app
RUN npm prune --omit=dev --omit=optional

# BACKEND: generate Prisma client
FROM base AS backend_codegen

WORKDIR /app
COPY --from=backend_deps /app/node_modules ./node_modules
COPY backend/package*.json .
COPY backend/prisma ./prisma
RUN npm run prisma:generate

FROM alpine:3 AS patcher
ARG GEDDES="false"
WORKDIR /app

COPY backend .
RUN if [ "$GEDDES" = "true" ]; then \
  apk add --no-cache patch && patch -p2 < geddes.diff; \
  fi
RUN rm geddes.diff

# BACKEND: run type checker
FROM backend_codegen AS backend_build
COPY --from=openapi_codegen /app/backend/src/generated/openapi.ts ./src/generated/openapi.ts
COPY --from=patcher /app .
RUN npx tsc --noEmit

# SWAGGER UI: install packages and build
FROM base AS swagger_build
WORKDIR /app
COPY swagger-ui .
RUN npm ci && npm run build

# Combine frontend & backend and run the app
FROM gcr.io/distroless/nodejs24-debian12:nonroot

EXPOSE 3000

# https://github.com/krallin/tini
ENV TINI_VERSION=v0.19.0
ADD --chmod=500 https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini

ENTRYPOINT ["/tini", "--", "/nodejs/bin/node", "--experimental-strip-types"]
CMD ["/app/src/index.ts"]

WORKDIR /app
COPY --from=regclient/regctl:v0.11.1-alpine /usr/local/bin/regctl /usr/local/bin/regctl
COPY --from=swagger_build /app/dist ./public/openapi
COPY --from=frontend_build /app/dist ./public
COPY --from=backend_prod_deps /app/node_modules ./node_modules
COPY openapi/*.yaml /openapi/
COPY templates/templates.json ./templates.json
COPY --from=backend_build --exclude=**/node_modules/** /app .
