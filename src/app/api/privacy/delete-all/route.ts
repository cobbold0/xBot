import { guard } from '@/web/api';
import { clearSession } from '@/web/auth';
import { q } from '@/core/db/pool';

export const dynamic = 'force-dynamic';

/** Immediately deletes all stored credentials, settings, scraped posts, drafts, actions, usage logs, and push subscriptions. */
export const POST = guard(async () => {
  await q('TRUNCATE actions, drafts, posts, errors, ai_usage, push_subscriptions, settings RESTART IDENTITY CASCADE');
  await q(`UPDATE account SET status='unknown', username=NULL, checked_at=now(), detail=NULL`);
  await q(`UPDATE control SET paused=false, emergency_stop=false, updated_at=now()`);
  await clearSession();
  return { ok: true };
});
