# This Dockerfile is used to build the AnvilOps backend for use with Tilt.
# It's used instead of the main anvilops image because it's much smaller and faster to build.
FROM node:24-trixie-slim AS base

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

# Run the backend
FROM base AS backend_run

# https://docs.docker.com/reference/dockerfile/#example-cache-apt-packages
RUN rm -f /etc/apt/apt.conf.d/docker-clean; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates

ENTRYPOINT ["/usr/local/bin/node", "--experimental-strip-types"]
CMD ["./src/index.ts"]

EXPOSE 3000

WORKDIR /app
COPY --from=compile_regclient_bindings /app/regclient-napi ./regclient-napi
COPY --from=backend_prod_deps /app/node_modules ./node_modules
COPY templates/templates.json ./templates.json
COPY --from=backend_codegen /app/src/generated/prisma/ ./src/generated/prisma
COPY openapi/*.yaml /openapi/
COPY --from=openapi_codegen /app/backend/src/generated/openapi.ts ./src/generated/openapi.ts
COPY backend/ .
