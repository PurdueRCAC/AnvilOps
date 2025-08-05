FROM node:24 AS base

FROM base AS deps
WORKDIR /work
COPY package*.json .
RUN npm ci

FROM base AS run
WORKDIR /work
COPY --from=deps /work/node_modules ./node_modules
COPY . .

CMD ["npm", "run", "start"]