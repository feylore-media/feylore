# Feylore Development Guide

## Prerequisites

- **Node.js 24 LTS** required
- **pnpm** 9+
- **Docker** (for PostgreSQL)
- **Git**

## Quick start

```bash
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:5173 (Vite dev proxy to API on 3000).

First visit: `/setup` creates the initial Admin user when no users exist.

## Environment variables

| Variable         | Required   | Description                                |
| ---------------- | ---------- | ------------------------------------------ |
| `DATABASE_URL`   | Yes        | PostgreSQL connection string               |
| `SESSION_SECRET` | Yes (prod) | Pepper for session token hashing           |
| `NODE_ENV`       | No         | `development` \| `production` \| `test`    |
| `PORT`           | No         | API port (default 3000)                    |
| `HOST`           | No         | Bind address (default 0.0.0.0)             |
| `STORAGE_ROOT`   | Yes        | Default managed storage root (server-only) |
| `INGEST_ROOT`    | No         | Filesystem ingest root (e.g. `./ingest`)   |
| `LIBRARY_BOOKS_ROOT` | No     | Books library mount (e.g. `./library/books`) |
| `MAX_UPLOAD_BYTES` | No       | Browser upload size limit (default 500MB)  |
| `MAX_UPLOAD_FILES` | No       | Browser upload file count limit (default 20) |
| `APP_URL`        | No         | Public URL for CSRF/origin checks          |
| `AUTH_*` / `OIDC_*` | No      | Authentication methods; see [AUTHENTICATION.md](./AUTHENTICATION.md) |
| `SMTP_*`         | No         | Optional email for password reset          |

Secrets are never logged. Production requires strong `SESSION_SECRET`.

## Database

```bash
pnpm db:generate   # generate migrations from schema changes
pnpm db:migrate    # apply migrations (explicit; not on app start)
pnpm db:seed       # seed roles, permissions, default data
```

After schema-breaking changes (such as the media identity migration), drop and recreate the development or test database before running `pnpm db:migrate`.

## Development commands

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `pnpm dev`        | API + Vite + ingest worker      |
| `pnpm dev:server` | API only                        |
| `pnpm dev:web`    | Vite only                       |
| `pnpm dev:worker` | Job worker                      |
| `pnpm build`      | Production build (server + web) |
| `pnpm start`      | Run production API              |
| `pnpm worker`     | Run production worker           |

## Testing

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test
pnpm test:watch
```

Tests use a real PostgreSQL database (`DATABASE_URL` or test default).

## Quality gates

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test
```

## Local architecture

### Web bundle and offline cache

The production build uses route loading for the EPUB reader and admin pages. HLS.js loads only when a video source needs JavaScript HLS playback; native HLS and ordinary video do not download it. This keeps the initial application chunk below Workbox's default 2 MiB per-file precache limit. Workbox still precaches the lazy chunks so these application scripts remain available offline.

At the September 2026 bundle check, the initial minified JavaScript chunk was 2,471 KiB before splitting and 1,223 KiB afterward. The separately emitted reader and HLS chunks were about 421 KiB and 574 KiB. The complete precache remained about 2,756 KiB across 67 entries because offline reading and playback still need those lazy scripts. Workbox's default limit applies to each file, so no higher limit is needed. To inspect source composition, run `pnpm exec vite build --configLoader native --sourcemap` and then `node scripts/analyze-web-bundle.mjs`. The script reports source sizes, which identify contributors but are not minified bundle sizes.

- **Vite** (5173) proxies `/api` to **Fastify** (3000)
- **PostgreSQL** (5432) via Docker Compose
- **Worker** processes pg-boss jobs separately

## Docker production

```bash
docker compose up -d
# Migrations run via entrypoint or manual step before app starts
```

Services: `postgres`, `app`, `worker`.

## Local ingest folders

For development with filesystem ingest:

| Path | Purpose |
| ---- | ------- |
| `./ingest` | Default ingest root (`INGEST_ROOT`) — drop files here for watcher pickup |
| `./library/books` | Default Books library mount (`LIBRARY_BOOKS_ROOT`) |

`pnpm dev` starts the API, Vite, and ingest worker (watcher + job handlers). Browser upload uses multipart `POST /api/v1/ingest/upload`; limits are config-only (`MAX_UPLOAD_BYTES`, `MAX_UPLOAD_FILES`).
