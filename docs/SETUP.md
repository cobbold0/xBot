# Setup

## 1. Anthropic key
Create a key at console.anthropic.com → `ANTHROPIC_API_KEY`. Check current prices and set `ANTHROPIC_PRICE_*` (USD per million tokens); set `ANTHROPIC_MODEL` if you want another model.

## 2. X session cookie (`X_API_KEY`)
`rettiwt-api` authenticates with a base64 string of your logged-in browser cookies.
1. Log in to x.com in a desktop browser (preferably a dedicated automation account).
2. DevTools → Application/Storage → Cookies → `https://x.com`. Copy the values of `auth_token`, `ct0`, `twid`.
3. In the DevTools console run: `btoa("auth_token=<v>;ct0=<v>;twid=<v>;")`
4. Put the output in `X_API_KEY`. Treat it like a password: never commit it, paste it into chat, or log it (the app redacts these patterns, but keep it out of source control).
5. Cookies expire or are invalidated when you log out or X rotates the session. The dashboard shows `expired`; repeat these steps.

## 3. Dashboard auth
`DASHBOARD_PASSWORD` (long passphrase) and `SESSION_SECRET` (`openssl rand -hex 32`). Serve over HTTPS in production (cookies are `Secure`; set `INSECURE_COOKIES=true` only for plain-HTTP local testing).

## 4. Database
`POSTGRES_PASSWORD` for compose, or your own `DATABASE_URL`.

## 5. First run
Start the stack, log in, open Settings: add `topics`, `searchTerms` and/or `accounts`, adjust `voice`. Leave `dryRun` on. Watch Activity/Drafts, then follow docs/E2E_CHECKLIST.md.
