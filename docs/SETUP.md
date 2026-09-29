# Setup

## 1. Anthropic key
Create a key at console.anthropic.com → `ANTHROPIC_API_KEY`. Check current prices and set `ANTHROPIC_PRICE_*` (USD per million tokens); set `ANTHROPIC_MODEL` if you want another model.

## 2. X session cookie
**Easiest:** open the dashboard → Settings → *Account & session*, paste your cookies and tap *Verify & save*. They are checked against X first, then stored encrypted (AES-256-GCM, key derived from `SESSION_SECRET`) in the database; the worker picks them up within seconds, no restart. Changing `SESSION_SECRET` later means re-entering them. Cookies saved in the dashboard override `X_API_KEY`.

**Alternative (`X_API_KEY` env var):**
`rettiwt-api` authenticates with a base64 string of your logged-in browser cookies.
1. Log in to x.com in a desktop browser (preferably a dedicated automation account).
2. DevTools → Application/Storage → Cookies → `https://x.com`. Copy the values of `auth_token`, `ct0`, `twid`.
3. Set `X_API_KEY` to the raw string `auth_token=<v>;ct0=<v>;twid=<v>;` (the app base64-encodes it for you; `btoa` in the console can fail on invisible characters copied from DevTools). A pre-encoded base64 value also works.
4. Copy each value carefully (`twid` looks like `u%3D123...`; keep it as-is). Treat it like a password: never commit it, paste it into chat, or log it (the app redacts these patterns, but keep it out of source control).
5. Cookies expire or are invalidated when you log out or X rotates the session. The dashboard shows `expired`; repeat these steps.

## 3. Dashboard auth
`DASHBOARD_PASSWORD` (long passphrase) and `SESSION_SECRET` (`openssl rand -hex 32`). Serve over HTTPS in production (cookies are `Secure`; set `INSECURE_COOKIES=true` only for plain-HTTP local testing).

## 4. Database
`POSTGRES_PASSWORD` for compose, or your own `DATABASE_URL`.

## 5. First run
Start the stack, log in, open Settings: add `topics`, `searchTerms` and/or `accounts`, adjust `voice`. Leave `dryRun` on. Watch Activity/Drafts, then follow docs/E2E_CHECKLIST.md.

## 6. Install the app & notifications (PWA)
- Open the dashboard over **HTTPS** in your phone browser and choose *Add to Home Screen* / *Install app*. On iPhone/iPad (iOS 16.4+) push works only from the installed Home Screen app.
- Generate VAPID keys once: `npm run vapid`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` you own) on the server and redeploy. Keep the private key secret.
- In the app: Settings → Notifications → *Enable on this device* → *Send test*. You get alerts for new drafts/reply drafts, published posts, failed actions, expired X session and reached AI budgets (each failure/budget/session alert at most once per day).
