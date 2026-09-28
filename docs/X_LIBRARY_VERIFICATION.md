# X integration library verification (checked 2026-09-28)

## TweetKit-X (requested) — rejected
- PyPI `tweetkit-x`; Python 3.10+, MIT. Library + CLI + MCP server. GitHub `nsozturk/tweetkit-x` shows ~6 commits.
- Cookie auth (`auth_token` + `ct0`), features cover search/like/retweet/post/reply.
- **Unsuitable**: Python, not TypeScript/npm; would need a Python sidecar process, breaking the "TypeScript, one database, minimal infra" goal; very young project with little history.

## rettiwt-api (chosen)
- npm `rettiwt-api` 7.1.4, ISC, written in TypeScript with bundled types, last published 2026-09-26 (actively maintained since 2023). Node ^22.21.
- Auth: `new Rettiwt({ apiKey })` where apiKey = base64 of `auth_token=..;ct0=..;twid=..;` (README). Session-cookie based; no official API.
- Verified methods (from installed `.d.ts`):
  - `tweet.search(filter, count, cursor)`; filter has `includeWords, hashtags, fromUsers, language, minLikes, onlyOriginal, sinceId, ...`
  - `user.timeline(id, count, cursor)`, `user.details(username|id)` (no arg = logged-in user)
  - `tweet.post({text, replyTo, quote, media})`, `tweet.like(id)`, `tweet.retweet(id)` → boolean, `post` → id | undefined
  - `TwitterError` with `status` for error handling; config: `proxy, timeout, delay, maxRetries`.
- Tweet fields: `id, fullText, createdAt, lang, likeCount, retweetCount, replyCount, viewCount, tweetBy{id,userName,followersCount,...}, replyTo, retweetedTweet`.
- Risks: reverse-engineered internal endpoints can break; automating via session cookies may violate X ToS and risks account restriction. Mitigated by adapter isolation, caps, dry-run default.
