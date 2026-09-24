# Deployment

## Requirements
Node.js **22.5+** (uses built-in `node:sqlite`). No external database service is needed.

## Build & run
```bash
npm ci
npm run build                     # web/dist + server typecheck
NODE_ENV=production AUTH_SECRET=$(openssl rand -hex 32) APP_URL=https://app.example.ng npm start
```
The API listens on `PORT` (default 4000) and serves the SPA. Put nginx/Caddy in front for TLS.

## Environment variables
See `.env.example`. Required in production: `NODE_ENV=production`, `AUTH_SECRET`, `APP_URL`. Recommended: `EMAIL_PROVIDER=resend` + `EMAIL_API_KEY` + `EMAIL_FROM`.

## Persistent data
* `DATABASE_URL` (default `./data/eduos.db`) — back up with `sqlite3 eduos.db ".backup backup.db"` or copy while the app is idle. WAL mode is enabled.
* `STORAGE_DIR` (default `./storage`) — uploaded files, tenant-scoped subfolders.
* `./outbox` — only used when `EMAIL_PROVIDER=outbox`.
Mount all three as volumes when containerising.

## Docker (example)
```Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=4000
VOLUME ["/app/data", "/app/storage"]
CMD ["npm", "start"]
```

## Health & monitoring
`GET /health` returns DB status and uptime — wire it to your platform's health check. Logs go to stdout.

## Seeding
`npm run seed` is blocked when `NODE_ENV=production`. Create real schools through `/register`.

## Scaling notes / migration path
SQLite comfortably serves a single-node deployment with thousands of concurrent users for this workload. For multi-node or very large tenants, the repository layer (`core/tenantRepo.ts`, module services) is the seam to swap in Postgres: schema is plain SQL, queries use standard SQL with `?` placeholders.
