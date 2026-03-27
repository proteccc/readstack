# Readstack — Docker build
#
# This produces a single image that can run either the web app or the worker,
# controlled by the CMD you pass at runtime:
#
#   Web:    docker run -e ... readstack npm start
#   Worker: docker run -e ... readstack npm run start:worker
#
# Build:
#   docker build -t readstack .
#
# Note: Railway deployments use nixpacks (nixpacks.toml) instead of this file.
# This Dockerfile is provided for self-hosting on other platforms.

FROM node:20-alpine AS deps
WORKDIR /app

# Install root dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Install worker dependencies
COPY worker/package.json worker/package-lock.json ./worker/
RUN cd worker && npm ci

# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/worker/node_modules ./worker/node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built app and dependencies
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

EXPOSE 3000

# Default to the web app. Override at runtime to run the worker.
CMD ["npm", "start"]
