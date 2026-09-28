# Safety model
- Gates (checked in order in `ActionExecutor`): emergency stop → paused → per-action enabled → dry-run (records `dry_run` outcome, no write) → daily cap → min spacing → adapter call → record `succeeded`/`failed` with adapter-confirmed id only.
- Auto-reply is disabled by default and there is no bulk/mention path: replies are drafts requiring human approval in the dashboard; approval sends a single reply to a single post.
- Prompt injection: post text is passed only inside `<untrusted_post>` blocks in the user turn; system prompt states it is data; output validated by zod with enums/bounded strings; injection-like content is flagged and never changes actions.
- Budget: `ai_usage` rows track tokens/cost; AI calls refuse when daily/monthly budget or per-run limits reached.
- Dedup: normalized-text hash + token Jaccard similarity vs. published/draft history (threshold configurable).
- Session expiry (401/403/auth errors) → account status `expired`, publishing halted, error recorded.
