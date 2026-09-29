# xBot

Self-hosted autonomous X (Twitter) agent: discovers posts, analyzes them with Claude, drafts original posts and replies, and (only if you enable it) publishes/likes/reposts under strict caps. **Draft-only and dry-run by default.** Uses the unofficial [`rettiwt-api`](https://www.npmjs.com/package/rettiwt-api) via session cookies — no paid X API.

> Automating a personal account with session cookies may violate X's Terms of Service and can get the account restricted. Use a low-risk account, keep caps low, and accept the risk yourself. There is **no** automatic reply, mass mention, or bulk engagement feature: replies are drafts you approve one by one.

See `docs/`: [ARCHITECTURE](docs/ARCHITECTURE.md) · [SAFETY](docs/SAFETY.md) · [X library verification](docs/X_LIBRARY_VERIFICATION.md) · [SETUP](docs/SETUP.md) · [DEPLOY (Coolify)](docs/DEPLOY.md) · [E2E checklist](docs/E2E_CHECKLIST.md)

## Quick start (local)
```bash
cp .env.example .env            # fill in values (see docs/SETUP.md for X cookies)
docker compose --env-file .env up -d --build
open http://localhost:3007      # log in with DASHBOARD_PASSWORD
```
Without Docker: `npm ci && npm run migrate && npm run worker` and `npm run dev` in a second shell (needs a Postgres `DATABASE_URL`).

## Processes
- **web** (Next.js): dashboard + API. Auth = password → signed HttpOnly cookie.
- **worker**: independent loop; jobs `account`, `discover` (fetch+analyze+reply drafts), `engage`, `generate`, `publish`. Postgres-backed scheduler with lock/expiry recovery. Health: `:3001/healthz`.
- **db**: Postgres 16 with volume. Migrations in `migrations/` run by the `migrate` service (and the worker on start).

## Configuration
Env vars seed first-run settings and hold secrets; everything else (topics, search terms, accounts, voice, limits, toggles, budgets) is edited in the dashboard **Settings** and stored in Postgres. See `.env.example`.

| Safety control | Default |
|---|---|
| `DRY_RUN` (no writes ever) | `true` |
| `AUTO_PUBLISH` (posts & approved replies) | `false` |
| `AUTO_LIKE` / `AUTO_REPOST` | `false` |
| Daily budget / monthly budget (USD est.) | 2 / 30 |
| Posts / likes / reposts / replies per day | 3 / 20 / 5 / 5 |

To go live: verify in dry-run, approve drafts, then in Settings turn off `dryRun` and turn on `autoPublish` (and optionally likes/reposts).

## Development
`npm test` (unit always; integration needs `TEST_DATABASE_URL=postgres://...` to a scratch DB — it **drops the public schema**), `npm run typecheck`, `npm run build`.

## Limitations
- Unofficial endpoints can break or be rate-limited by X at any time; the adapter (`src/core/x`) isolates this.
- Cost is estimated from token usage × configured prices (`ANTHROPIC_PRICE_*`), not billed amounts.
- Cookie expiry needs a manual refresh (dashboard shows `expired`); no password/2FA login is implemented on purpose.
- Single dashboard user; login throttle is per-process memory.
- Search uses `rettiwt-api` filters (keywords split into words; `onlyOriginal`).

## Troubleshooting
- Account `expired`/`error`: re-extract cookies (docs/SETUP.md), update `X_API_KEY`, restart worker.
- Nothing happening: check banners (paused / emergency stop / dry-run), the Jobs table, and Recent errors.
- `Budget reached` in worker logs: raise budgets in Settings; counters reset per `TZ` day/month.
- Drafts stuck approved: `autoPublish` is off, or daily cap/spacing reached (see Activity → blocked).
- Draft `failed` "outcome unconfirmed": the worker died or the network failed mid-send; check X manually before using “Back to draft”.
