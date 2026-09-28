# Deploy on Coolify

1. Push this repo to GitHub/GitLab. In Coolify: **New Resource → Docker Compose** (from your repo), compose file `docker-compose.yml`.
2. **Environment Variables** (mark secrets as such): `POSTGRES_PASSWORD`, `ANTHROPIC_API_KEY`, `X_API_KEY`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`, `TZ`, and optionally the limit variables from `.env.example`. Leave `DRY_RUN=true`, `AUTO_*=false` for the first deploy.
3. Assign your domain to the **web** service (port 3000). Coolify's proxy provides HTTPS. Do not expose `db` or `worker`.
4. Deploy. Order is enforced: `db` (healthy) → `migrate` (one-shot) → `worker` + `web`. Health checks: web `/api/health`, worker `:3001/healthz`, db `pg_isready`.
5. Persistent storage: named volume `pgdata` (Postgres data). Back it up (Coolify scheduled backups or `pg_dump`).
6. Restarts: `restart: unless-stopped`. On crash/redeploy the scheduler recovers expired job locks; drafts interrupted mid-send become `failed` (never resent automatically).
7. Update cookies: change `X_API_KEY` and redeploy/restart the worker.
Note: env vars in compose are shared by web and worker; only `web` needs `DASHBOARD_PASSWORD`/`SESSION_SECRET` and only `worker` needs the X/Anthropic keys, but sharing keeps the file simple.
