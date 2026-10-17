import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { q } from '@/core/db/pool';
import { getTenantId } from '@/core/tenant';
import { getSettings } from '@/core/settings';
import { ActionExecutor } from '@/core/policy/executor';
import { getStoredApiKey } from '@/core/x/credentials';
import { createXClient } from '@/core/x/rettiwt';
import { XError } from '@/core/x/types';

export const dynamic = 'force-dynamic';

const Body = z.object({
  id: z.number().int().positive(),
}).strict();

export const POST = guard(async (req) => {
  const userId = getTenantId();
  const { id } = Body.parse(await req.json());

  const key = (await getStoredApiKey(userId)) ?? process.env.X_API_KEY ?? null;
  if (!key) throw new HttpError(400, 'No X credentials connected. Link your X account in Settings first.');

  const client = createXClient(key);
  const s = await getSettings(userId);
  const exec = new ActionExecutor(() => client, { ...s, autoPublish: true });

  const { rows } = await q<{ id: number; kind: 'post' | 'reply'; text: string; reply_to_x_id: string | null }>(
    `UPDATE drafts SET status='publishing', updated_at=now() WHERE user_id=$1 AND id=$2 RETURNING id, kind, text, reply_to_x_id`,
    [userId, id],
  );
  const d = rows[0];
  if (!d) throw new HttpError(404, 'Draft not found');

  const r = await exec.execute({ type: d.kind, text: d.text, targetXId: d.reply_to_x_id ?? undefined, draftId: d.id });
  if (r.status === 'succeeded') {
    await q(`UPDATE drafts SET status='published', x_id=$2, published_at=now(), error=NULL WHERE id=$1`, [d.id, r.resultXId]);
    return { ok: true, status: 'published', resultXId: r.resultXId, url: `https://x.com/i/status/${r.resultXId}` };
  } else if (r.status === 'dry_run') {
    await q(`UPDATE drafts SET status='draft', error='dry-run enabled in settings' WHERE id=$1`, [d.id]);
    return { ok: false, status: 'dry_run', error: 'Dry-run is enabled in Settings. Turn it off to publish for real.' };
  } else {
    await q(`UPDATE drafts SET status='failed', error=$2 WHERE id=$1`, [d.id, r.detail]);
    throw new HttpError(400, r.detail);
  }
});
