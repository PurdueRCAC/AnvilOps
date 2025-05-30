# FRONTEND: install dependencies
FROM node:24 AS frontend_deps

WORKDIR /app
COPY frontend/package*.json .
RUN --mount=type=cache,target=/root/.npm npm ci

# FRONTEND: build for production
FROM node:24 AS frontend_build

WORKDIR /app
COPY --from=frontend_deps /app/node_modules ./node_modules
COPY frontend .

RUN npm run build

# BACKEND: install dependencies
FROM node:24 AS backend_deps

WORKDIR /app
COPY backend/package*.json .
RUN --mount=type=cache,target=/root/.npm npm ci

# BACKEND: generate Prisma client
FROM node:24 AS backend_build

WORKDIR /app
COPY --from=backend_deps /app/node_modules ./node_modules
COPY backend/package*.json .
COPY backend/prisma ./prisma
RUN npm run prisma:generate

# Combine frontend & backend and run the app
FROM node:24 AS backend_run

WORKDIR /app
COPY --from=frontend_build /app/dist ./public
COPY --from=backend_deps /app/node_modules ./node_modules
COPY --from=backend_build /app/src/generated/prisma ./src/generated/prisma
COPY backend .

CMD ["npm", "run", "start"]
