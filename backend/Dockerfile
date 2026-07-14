FROM node:20-alpine AS builder

# Prisma query engine requires OpenSSL
RUN apk add --no-cache openssl

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist           ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Copy full prisma dir (schema + migrations) so migrate deploy works
COPY --from=builder /app/prisma         ./prisma

# db push is idempotent and doesn't need a migration history —
# it syncs the schema directly. Safe for first-run and re-runs.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
