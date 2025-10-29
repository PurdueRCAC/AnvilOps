FROM node:24-alpine AS base

FROM base AS deps
WORKDIR /work
COPY package*.json .
RUN npm ci

FROM base AS typecheck
WORKDIR /work
COPY --from=deps /work/node_modules ./node_modules
COPY . .
RUN npx tsc --noEmit

FROM typecheck AS run
WORKDIR /work
RUN npm prune --omit=dev

CMD ["npm", "run", "start"]
