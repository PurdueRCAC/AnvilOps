# This Dockerfile is used to build the AnvilOps frontend for use with Tilt.
# It's used instead of the main anvilops image because it's much smaller and faster to build, and it supports hot reloading with Vite and Tilt's Live Reload feature.

FROM node:24-alpine AS base

# Install dependencies
FROM base AS frontend_deps

WORKDIR /app
COPY frontend/package*.json .
RUN --mount=type=cache,target=/root/.npm npm ci

# Generate TypeScript types from OpenAPI spec
FROM base AS openapi_codegen

WORKDIR /app/openapi
COPY openapi/package*.json .
RUN npm ci
COPY openapi/*.yaml .
RUN npm run generate

# Run the frontend
FROM base

WORKDIR /app
COPY --from=frontend_deps /app/node_modules ./node_modules
COPY --from=openapi_codegen /app/backend/src/generated/openapi.ts ./src/generated/openapi.ts
COPY frontend/ .

# Tell Vite to proxy `/api` to the backend pod instead of localhost
ENV IN_TILT "1"
# Run `npm run dev` so that Vite hot-reloads when Tilt Live Update copies changed files into the container
CMD ["npm", "run", "dev"]
