# This Dockerfile is used to build the image that's used to migrate the database.
# It's used instead of the main anvilops image because it's much smaller and faster to build.

FROM node:24-alpine AS base

# Install backend dependencies
FROM base AS backend_deps

WORKDIR /app
COPY backend/package*.json .
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# Copy dependencies from previous steps and run the migration
FROM base

WORKDIR /app
COPY --from=backend_deps /app/node_modules ./node_modules
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./prisma.config.ts

CMD ["npx", "prisma", "migrate", "deploy"]
