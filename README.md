# Cooperative Vaults

**Cooperative Vaults** is a TechVaults product: a configurable management platform for Nigerian cooperative societies of every sector (staff, agricultural, transport, market, multipurpose, thrift & credit, housing).

- **Discovery plan:** [docs/discovery](docs/discovery/README.md) · stakeholder PDF: [TechVaults-Cooperative-Discovery-Plan-v0.2.pdf](docs/TechVaults-Cooperative-Discovery-Plan-v0.2.pdf)
- **Preview deployment (Railway):** https://cooperative.up.railway.app (synthetic demo society only; no real member data)
  - Demo admin: `admin@demo.techvaults.local`; password is the `SEED_ADMIN_PASSWORD` variable on the Railway `web` service. Two-factor is currently **not required** on the preview (`REQUIRE_TWO_FACTOR=false` on `web`, set 2026-10-17 at TechVaults' request); remove that variable to enforce it again (D-014).
  - The demo admin belongs to two synthetic societies (a staff cooperative and a farmers' multipurpose cooperative with a year of history); switch between them in the sidebar.
  - Entries need a second officer's approval (D-015). The demo admin is secretary, treasurer and auditor, so to try approvals, open **Officers**, invite a second email as Chairperson, and open the link in a private window.

## Layout

| Path | What it is |
|---|---|
| `packages/core` | Domain rules with no framework code: kobo money, double-entry ledger, audit chain, roles |
| `packages/db` | Postgres schema and migrations (row-level security, append-only ledger, balance checks) and services |
| `apps/web` | Next.js web app: design system in `src/components`, app shell in `src/components/shell` |
| `apps/web/e2e` | Browser walkthrough (`walkthrough.mjs`) and visual review screenshots (`screenshots.mjs`) |

## Develop

```sh
pnpm install
pnpm test                       # core unit tests
TEST_PG_URL=postgres://postgres@localhost:5432/postgres pnpm --filter @techvaults/db test   # database guardrail tests
DATABASE_ADMIN_URL=... APP_DB_PASSWORD=... pnpm --filter @techvaults/db db:migrate
SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... DATABASE_ADMIN_URL=... pnpm --filter @techvaults/web seed
DATABASE_URL=postgres://coop_app:...@.../db BETTER_AUTH_SECRET=... BETTER_AUTH_URL=http://localhost:3000 pnpm dev
BASE=http://localhost:3000 EMAIL=... PASSWORD=... pnpm --filter @techvaults/web e2e   # browser walkthrough on a fresh seed (38 checks)
```

## Deploy (Railway)

`railway up --service web` from the repo root. The container runs migrations, then the optional seed, then the app.
Required variables on `web`: `DATABASE_URL` (coop_app), `DATABASE_ADMIN_URL` (owner), `APP_DB_PASSWORD`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; optional `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.

The app always connects as the restricted `coop_app` role; migrations run as the database owner.
