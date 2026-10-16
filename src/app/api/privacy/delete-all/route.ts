import { guard } from '@/web/api';
import { clearSession } from '@/web/auth';
import { q } from '@/core/db/pool';
import { prisma } from '@/core/db/prisma';
import { DEFAULT_TENANT_ID, getTenantId, settingKey } from '@/core/tenant';

export const dynamic = 'force-dynamic';

/** Immediately deletes all stored credentials, settings, scraped posts, drafts, actions, usage logs, and push subscriptions for the current tenant. */
export const POST = guard(async () => {
  const userId = getTenantId();
  await q('DELETE FROM actions WHERE user_id = $1', [userId]);
  await q('DELETE FROM drafts WHERE user_id = $1', [userId]);
  await q('DELETE FROM posts WHERE user_id = $1', [userId]);
  await q('DELETE FROM errors WHERE user_id = $1', [userId]);
  await q('DELETE FROM ai_usage WHERE user_id = $1', [userId]);
  await q('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
  await q('DELETE FROM settings WHERE key IN ($1, $2) OR key LIKE $3', [
    settingKey('app', userId),
    settingKey('x_credentials', userId),
    userId === DEFAULT_TENANT_ID ? 'notified:%' : `notified:%:${userId}`,
  ]);
  await q(`UPDATE account SET status='unknown', username=NULL, checked_at=now(), detail=NULL WHERE user_id = $1`, [userId]);
  await q(`UPDATE control SET paused=false, emergency_stop=false, updated_at=now() WHERE user_id = $1`, [userId]);
  if (userId !== DEFAULT_TENANT_ID) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await clearSession();
  return { ok: true };
});
