# Manual end-to-end checklist (real account)
Use a dedicated account. Keep caps tiny.
- [ ] Deploy with `DRY_RUN=true`. Login works; wrong password rejected; `/api/status` without login → 401.
- [ ] Dashboard Account card shows `connected @yourhandle`. (If not: cookie wrong/expired.)
- [ ] Settings: add 1 topic, 1 search term, save. Within the poll interval, Jobs show `discover ok`, "Posts seen" grows; no duplicates after the next run.
- [ ] AI usage card shows tokens/cost increasing; set daily budget to `0.0001` → next AI job logs budget reached and stops; restore.
- [ ] Drafts appear from the generator (or add one manually). Edit, approve, reject work. Near-duplicate of an existing draft is refused.
- [ ] With dryRun on and autoPublish on, approved draft yields Activity `dry_run` and nothing on X.
- [ ] Set maxPostsPerDay=1, dryRun off, autoPublish on. Approved draft posts exactly once; Activity `succeeded` with the X id; the post is visible on x.com. Second approved draft is `blocked (daily cap)`.
- [ ] Enable autoLike with maxLikesPerDay=1: exactly one like appears on x.com; nothing else.
- [ ] Reply drafts: appear only for posts flagged by analysis; approving sends one reply (with autoPublish on); nothing is ever sent unapproved.
- [ ] Pause: jobs show `skipped`. Emergency stop: same, banner shown, approved drafts do not publish; Clear resumes.
- [ ] Restart the worker mid-run: no duplicate posts; jobs resume.
- [ ] Invalidate the cookie (log out of x.com): account turns `expired`, error recorded, no writes.
- [ ] Grep container logs for your cookie/API key: no matches.
