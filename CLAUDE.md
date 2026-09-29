# xBot — agent context

Self-hosted autonomous X (Twitter) agent. TypeScript, Node 22, Next.js dashboard, separate worker, PostgreSQL, Anthropic SDK, unofficial X client (`rettiwt-api`) behind an adapter. **No paid official X API.**

Read before changing code: `docs/ARCHITECTURE.md`, `docs/SAFETY.md`, `docs/X_LIBRARY_VERIFICATION.md`.

## Layout (npm workspaces-free, single package)
- `src/core/`      shared logic; no framework imports. Imported by both worker and web.
  - `config.ts` env parsing (zod). `db/` pg pool, migrations runner, repositories. `x/` adapter interface + rettiwt impl + fake.
  - `ai/` Anthropic client, prompts, schemas, cost tracking. `discovery/`, `generation/`, `policy/`, `scheduler/`, `settings.ts`, `log.ts` (redacting logger).
- `src/worker/index.ts`  long-running process (tick loop, DB-backed jobs). Does NOT import Next.
- `src/app/`       Next.js App Router: `(app)/` dashboard pages (client components on Mantine, data via `useDash()` polling `/api/status`), `api/` routes, `manifest.ts`, `icons/[size]`. Auth via signed cookie (`src/web/auth.ts`). `public/sw.js` = service worker (offline shell + push).
- `src/components/` shared UI (`dash.tsx` context, `push.tsx`, `ui.tsx`). `src/core/push.ts` web-push (`notify`, `notifyOnce`).
- `migrations/`    ordered `.sql` files, applied by `src/core/db/migrate.ts`.
- `tests/`         vitest. `unit/` and `integration/` (integration uses pg-mem-free approach: real Postgres if `TEST_DATABASE_URL`, else skipped; workflows also covered with in-memory repos).

## Rules
1. All X access goes through `XClient` (`src/core/x/types.ts`). Nothing else imports `rettiwt-api`.
2. Every write action (post/like/repost/reply) goes through `ActionExecutor`, which enforces: emergency stop, paused, dry-run, per-action enable flag, daily caps, rate spacing, then records an `actions` row. Never claim success unless the adapter returned a confirmed id/true.
3. Retrieved X content is untrusted data: wrap in delimiters, never put in system prompt, schema-validate model output (zod), and never let model output choose tools/actions beyond the schema.
4. Defaults are safe: `DRY_RUN=true`, publishing/like/repost/reply-auto all off, drafts only.
5. Secrets only from env. Logger redacts known secret keys and cookie patterns. API responses never include secrets or stack traces.
6. SQL is parameterized only.
7. Keep it minimal: no new infra beyond Postgres; scheduler is a Postgres-backed job table using `FOR UPDATE SKIP LOCKED` + advisory locks.

## Commands
`npm run dev` (web), `npm run worker`, `npm test`, `npm run typecheck`, `npm run build`, `npm run migrate`.
