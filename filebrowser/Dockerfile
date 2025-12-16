FROM node:24-alpine AS base

FROM base AS deps
WORKDIR /work
COPY package*.json .
RUN npm ci --ignore-scripts

FROM base AS typecheck
WORKDIR /work
COPY --from=deps /work/node_modules ./node_modules
COPY . .
RUN npx tsc --noEmit

FROM typecheck AS run
WORKDIR /work
RUN npm prune --omit=dev --omit=optional

FROM gcr.io/distroless/nodejs24-debian12:nonroot

# https://github.com/krallin/tini
ENV TINI_VERSION=v0.19.0
ADD --chown=65532:65532 --chmod=500 https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
ENTRYPOINT ["/tini", "--"]

WORKDIR /app
COPY --chown=65532:65532 --from=run /work /app
CMD ["/nodejs/bin/node", "/app/index.ts"]

USER 65532
# ^ This user already exists in the distroless base image
HEALTHCHECK --interval=3s --timeout=3s --start-period=5s --retries=3 CMD [ "/nodejs/bin/node", "/app/healthcheck.ts" ]
