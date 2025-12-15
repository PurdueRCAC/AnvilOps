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
ADD --chmod=500 https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
ENTRYPOINT ["/tini", "--"]

WORKDIR /app
COPY --from=run /work /app
CMD ["/nodejs/bin/node", "/app/index.ts"]

HEALTHCHECK --interval=3s --timeout=3s --start-period=5s --retries=3 CMD [ "/nodejs/bin/node", "/app/healthcheck.ts" ]
