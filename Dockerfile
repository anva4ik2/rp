FROM node:20-alpine AS builder

WORKDIR /app

# Copy all package.json files for workspace install
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/ragemp-server/package.json ./packages/ragemp-server/
COPY packages/ragemp-client/package.json ./packages/ragemp-client/
COPY packages/ragemp-cef/package.json ./packages/ragemp-cef/

# Install dependencies (npm ci because package-lock.json is in repo)
RUN npm ci --include=dev --no-audit --no-fund

# Copy source files
COPY . .

# Build workspace packages
RUN npm --workspace @gta-rp/shared run build
RUN npm --workspace @gta-rp/server run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

# Install production dependencies only
RUN npm ci --omit=dev --no-audit --no-fund

# Copy built files from builder
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start server
CMD ["npm", "--workspace", "@gta-rp/server", "run", "start"]
