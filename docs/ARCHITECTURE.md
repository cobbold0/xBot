# Architecture

```
 Browser ──> Next.js (web) ──┐
                             ├─> PostgreSQL <── Worker (tick loop) ──> XClient adapter ──> rettiwt-api
                             │                          └────────────> Anthropic SDK
```
Web and worker share `src/core` and only communicate through Postgres (settings, drafts, control flags, jobs). Worker keeps running when the dashboard is closed.

## Modules
| Module | Path | Responsibility |
|---|---|---|
| X adapter | `core/x` | `XClient` interface; `RettiwtClient`; `FakeXClient` for tests |
| AI agent | `core/ai` | Anthropic calls, prompts, zod schemas, JSON repair/failure handling, usage/cost |
| Discovery | `core/discovery` | poll search terms/accounts, dedupe by `posts.x_id`, analyze new posts |
| Generation | `core/generation` | original post drafts, near-dup check, char limit |
| Policy | `core/policy` | engagement decisions + `ActionExecutor` gates/caps |
| Scheduler | `core/scheduler` | Postgres `jobs` table, `SKIP LOCKED` claim, advisory lock per job type, stale-lock recovery |
| DB | `core/db` | pool, migrations, repos |
| API/Dashboard | `app` | auth, status, drafts approve/reject, settings, pause/stop |

## Jobs (recurring, interval from settings)
`discover` → `analyze` → `generate` (creates drafts) → `publish` (due scheduled/approved drafts) → `engage` (likes/reposts for recommended posts, if enabled).

## Schema
`migrations/001_init.sql`: settings(kv jsonb), control(singleton: paused, emergency_stop), posts(x_id unique, author, text, metadata, analysis jsonb, status), drafts(kind post|reply, text, hash, status draft|approved|scheduled|published|rejected|failed, scheduled_for, x_id, reply_to_x_id), actions(type, target, status, dry_run, error, x_id), ai_usage(model, in/out tokens, cost_usd, purpose), jobs(name unique, next_run_at, locked_until, last_*), errors(source, message), account(status).
