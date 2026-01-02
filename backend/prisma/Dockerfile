# This Dockerfile builds a container image that applies Prisma migrations to a database.
# Specify the database connection string in the DATABASE_URL environment variable.

# The main AnvilOps image omits all devDependencies, which includes `prisma`, the Prisma CLI.
# This means we need to build a separate image (this one) for running database migrations.

# This Dockerfile should be built with `backend/` as its context, not this directory.

FROM node:24-alpine AS build
RUN apk add --no-cache jq=1.8.1-r0

WORKDIR /app

COPY package*.json /app/

# Install Prisma using the version in the backend package.json (but don't install any other backend packages)
RUN PRISMA_VERSION=$(jq -r .devDependencies.prisma package.json) && \
    echo '{"dependencies":{"prisma":"'"$PRISMA_VERSION"'"}}' > /app/package.json

RUN npm ci --ignore-scripts --omit=optional --omit=dev

COPY prisma/schema.prisma /app/prisma/
COPY prisma/migrations/ /app/prisma/migrations/

FROM gcr.io/distroless/nodejs24-debian12:nonroot
WORKDIR /app
USER 65532

# https://github.com/krallin/tini
ENV TINI_VERSION=v0.19.0
ARG TARGETARCH=amd64
ADD --chown=65532:65532 --chmod=500 https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-${TARGETARCH} /tini
ENTRYPOINT ["/tini", "--", "/nodejs/bin/node", "/app/node_modules/.bin/prisma"]

COPY --chown=65532:65532 --from=build /app /app

# Download the native libraries that Prisma needs to run
RUN ["/nodejs/bin/node", "/app/node_modules/.bin/prisma", "version"]

COPY --chown=65532:65532 prisma.config.ts .

CMD ["migrate", "deploy"]
