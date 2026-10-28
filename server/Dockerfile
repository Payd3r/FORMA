# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Build deps per better-sqlite3 (addon nativo)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Installa TUTTE le dipendenze (incluse devDeps per tsc)
COPY package*.json ./
RUN npm install

# Copia i sorgenti TypeScript e compila
COPY . .
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Build deps per better-sqlite3 (addon nativo già compilato nel builder,
# ma serve g++ per il linking del modulo .node al runtime)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Installa solo le dipendenze di produzione
COPY package*.json ./
RUN npm install --omit=dev

# Copia il JS compilato dal builder
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/index.js"]
