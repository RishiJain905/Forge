# syntax=docker/dockerfile:1

# ─── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ─── Stage 2: runtime ───────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache git curl

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

RUN addgroup -g 1001 -S forge && adduser -S forge -u 1001 -G forge

USER forge
WORKDIR /home/forge

ENTRYPOINT ["node", "/app/dist/src/index.js"]
