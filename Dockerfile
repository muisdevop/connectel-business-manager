# Multi-stage build: compile the frontend, prune to production deps, then run a
# small Node runtime that serves dist/ and mounts the API router against Postgres.
# No Deno/Qoder platform dependency; the runtime needs no network install.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund --fetch-retries=6 --fetch-retry-mintimeout=15000 --fetch-retry-maxtimeout=120000
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY functions ./functions
COPY server ./server
COPY schema.sql ./schema.sql
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3000
# Migrate (idempotent) then serve. Single instance; migrate prints bootstrap
# credentials once on first start.
CMD ["sh", "-c", "node server/migrate.mjs && node server/server.mjs"]