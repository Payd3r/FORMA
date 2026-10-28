# Build stage: install deps and compile the Vite PWA
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (reproducible con lockfile)
COPY package*.json ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# Copy sources and build
COPY . .
ENV NODE_ENV=production
RUN npm run build

# Runtime stage: serve static assets via NGINX
FROM nginx:1.27-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

# Custom nginx config with SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
