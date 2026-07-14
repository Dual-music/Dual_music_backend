# syntax=docker/dockerfile:1
# ============================================================================
# Multi-stage build for the Dual Music API.
#   deps  → install production dependencies
#   build → (reserved for future asset/codegen steps)
#   run   → minimal runtime image
# ============================================================================
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Regenerate models/migration from the (mounted) frontend types when present.
# Skipped gracefully if the frontend directory is not part of the build context.
RUN node scripts/generate-schema.js || echo "schema generation skipped (types.ts absent in build context)"

FROM node:20-alpine AS run
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY package.json .sequelizerc ./
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
