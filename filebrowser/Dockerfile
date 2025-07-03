FROM node:24 AS base

FROM base AS deps
COPY package*.json .
RUN npm ci

FROM base AS run
COPY --from=deps node_modules node_modules
COPY . .

CMD ["npm", "run", "start"]