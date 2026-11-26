# Feylore

Self-hosted personal library and media application.

## Documentation

- [Agent guidelines](./agents.md) (AGENTS.md)
- [V1 Scope](./docs/V1-SCOPE.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Development](./docs/DEVELOPMENT.md)

## Quick start

```bash
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Visit http://localhost:5173 and complete first-run setup at `/setup`.
