# syntax=docker/dockerfile:1
FROM node:24-trixie-slim AS base

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

# BACKEND: compile regclient Node-API bindings
FROM base AS compile_regclient_bindings

# https://docs.docker.com/reference/dockerfile/#example-cache-apt-packages
RUN rm -f /etc/apt/apt.conf.d/docker-clean; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends build-essential golang ca-certificates python3

WORKDIR /app
COPY backend/package*.json .
COPY backend/regclient-napi ./regclient-napi
COPY --from=backend_deps /app/node_modules ./node_modules
RUN --mount=type=cache,target=/root/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    npm rebuild --foreground-scripts=true regclient-napi

# BACKEND: run type checker
FROM backend_codegen AS backend_build
COPY --from=openapi_codegen /app/backend/src/generated/openapi.ts ./src/generated/openapi.ts
COPY backend .
COPY --from=compile_regclient_bindings /app/regclient-napi ./regclient-napi
RUN npx tsc --noEmit

# SWAGGER UI: install packages and build
FROM base AS swagger_build
WORKDIR /app
COPY swagger-ui .
RUN --mount=type=cache,target=/root/.npm npm ci
RUN npm run build

# Combine frontend & backend and run the app
FROM gcr.io/distroless/nodejs24-debian13:nonroot

EXPOSE 3000

# https://github.com/krallin/tini
ENV TINI_VERSION=v0.19.0
ADD --chown=65532:65532 --chmod=500 https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini

ENTRYPOINT ["/tini", "--", "/nodejs/bin/node", "--experimental-strip-types", "--require", "/app/src/instrumentation.ts"]
CMD ["/app/src/index.ts"]

WORKDIR /app
COPY --chown=65532:65532 --from=swagger_build /app/dist ./public/openapi
COPY --chown=65532:65532 --from=compile_regclient_bindings /app/regclient-napi ./regclient-napi
COPY --chown=65532:65532 --from=frontend_build /app/dist ./public
COPY --chown=65532:65532 --from=backend_prod_deps /app/node_modules ./node_modules
COPY --chown=65532:65532 openapi/*.yaml /openapi/
COPY --chown=65532:65532 templates/templates.json ./templates.json
COPY --chown=65532:65532 --from=backend_build --exclude=**/node_modules/** /app .

USER 65532
# ^ This user already exists in the distroless base image
