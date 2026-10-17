# TechVaults Cooperative Management Platform

A configurable cooperative management platform for Nigerian cooperative societies.

- **Discovery plan:** [docs/discovery](docs/discovery/README.md) · stakeholder PDF: [TechVaults-Cooperative-Discovery-Plan-v0.2.pdf](docs/TechVaults-Cooperative-Discovery-Plan-v0.2.pdf)
- **Preview deployment (Railway):** https://web-production-0be64.up.railway.app (no real member data)

## Layout

| Path | What it is |
|---|---|
| `packages/core` | Domain rules with no framework code: kobo money, double-entry ledger, audit chain, roles |
| `packages/db` | Postgres schema and migrations (row-level security, append-only ledger, balance checks) and services |
| `apps/web` | Next.js web app |

## Develop

```sh
pnpm install
pnpm test                       # core unit tests
TEST_PG_URL=postgres://postgres@localhost:5432/postgres pnpm --filter @techvaults/db test   # database guardrail tests
DATABASE_ADMIN_URL=... APP_DB_PASSWORD=... pnpm --filter @techvaults/db db:migrate
DATABASE_URL=postgres://coop_app:...@.../db pnpm dev
```

The app always connects as the restricted `coop_app` role; migrations run as the database owner.
