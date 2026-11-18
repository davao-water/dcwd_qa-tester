
# ============================================
# STAGE 1: BUILD NEXT.JS APPLICATION
# ============================================
FROM node:24-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Install dependencies using npm
COPY package.json package-lock.json ./

# Prisma files are required by the postinstall script
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

# Copy application source
COPY . .

# Build Next.js for production
RUN npm run build


# ============================================
# STAGE 2: PRODUCTION SERVER
# ============================================
FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Preserve build output, generated Prisma client,
# application scripts and migration tooling.
COPY --from=builder --chown=node:node /app/ /app/

# Run as non-root user
USER node

EXPOSE 3000

# Start Next.js on all container interfaces
CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
