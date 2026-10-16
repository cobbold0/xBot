import { q } from '../db/pool';
import type { Settings } from '../settings';
import { ActionExecutor } from '../policy/executor';
import { notify } from '../push';
import { getTenantId } from '../tenant';

/** Recovers drafts stuck in 'publishing' (crash mid-send): outcome unknown, so never auto-retried. */
export async function recoverStuck(userId = getTenantId()) {
  await q(`UPDATE drafts SET status='failed', error='Interrupted while publishing; outcome unconfirmed. Check X before retrying.' WHERE user_id=$1 AND status='publishing' AND updated_at < now() - interval '10 minutes'`, [userId]);
}

/** Publishes at most one due approved draft per call for the current tenant. The atomic claim prevents double publishing. */
export async function publishDue(exec: ActionExecutor, s: Settings): Promise<string> {
  if (!s.autoPublish) return 'publishing disabled';
  const userId = getTenantId();
  await recoverStuck(userId);
  const { rows } = await q<{ id: number; kind: 'post' | 'reply'; text: string; reply_to_x_id: string | null }>(
    `UPDATE drafts SET status='publishing', updated_at=now() WHERE id = (SELECT id FROM drafts WHERE user_id=$1 AND status='approved' AND (scheduled_for IS NULL OR scheduled_for <= now()) ORDER BY scheduled_for NULLS FIRST, id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, kind, text, reply_to_x_id`,
    [userId],
  );
  const d = rows[0];
  if (!d) return 'nothing due';
  const r = await exec.execute({ type: d.kind, text: d.text, targetXId: d.reply_to_x_id ?? undefined, draftId: d.id });
  if (r.status === 'succeeded') {
    await q(`UPDATE drafts SET status='published', x_id=$2, published_at=now(), error=NULL WHERE id=$1`, [d.id, r.resultXId]);
    await notify({ title: d.kind === 'reply' ? 'Reply sent' : 'Post published', body: d.text.slice(0, 120), tag: 'published', url: '/drafts' });
  } else if (r.status === 'dry_run') {
    await q(`UPDATE drafts SET status='approved', error='dry-run: not sent', scheduled_for = now() + interval '1 hour' WHERE id=$1`, [d.id]);
  } else if (r.retryable || r.status === 'blocked') {
    await q(`UPDATE drafts SET status='approved', error=$2 WHERE id=$1`, [d.id, r.detail.slice(0, 300)]);
  } else {
    await q(`UPDATE drafts SET status='failed', error=$2 WHERE id=$1`, [d.id, r.detail.slice(0, 300)]);
  }
  return r.status;
}
