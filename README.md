# TechVaults Cooperative Management Platform

A configurable cooperative management platform for Nigerian cooperative societies.

- **Discovery plan:** [docs/discovery](docs/discovery/README.md) · stakeholder PDF: [TechVaults-Cooperative-Discovery-Plan-v0.2.pdf](docs/TechVaults-Cooperative-Discovery-Plan-v0.2.pdf)
- **Preview deployment (Railway):** https://web-production-0be64.up.railway.app (synthetic demo society only; no real member data)
  - Demo admin: `admin@demo.techvaults.local`; password is the `SEED_ADMIN_PASSWORD` variable on the Railway `web` service. Two-factor setup is required on first sign-in.
  - Entries need a second officer's approval (D-015). The demo admin is secretary, treasurer and auditor, so to try approvals, open **Officers**, invite a second email as Chairperson, and open the link in a private window.

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
SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... DATABASE_ADMIN_URL=... pnpm --filter @techvaults/web seed
DATABASE_URL=postgres://coop_app:...@.../db BETTER_AUTH_SECRET=... BETTER_AUTH_URL=http://localhost:3000 pnpm dev
BASE=http://localhost:3000 EMAIL=... PASSWORD=... pnpm --filter @techvaults/web e2e   # browser walkthrough on a fresh seed (34 checks)
```

## Deploy (Railway)

`railway up --service web` from the repo root. The container runs migrations, then the optional seed, then the app.
Required variables on `web`: `DATABASE_URL` (coop_app), `DATABASE_ADMIN_URL` (owner), `APP_DB_PASSWORD`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; optional `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.

The app always connects as the restricted `coop_app` role; migrations run as the database owner.
