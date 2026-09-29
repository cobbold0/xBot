import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { q } from '@/core/db/pool';
import { getSettings } from '@/core/settings';
import { isNearDuplicate, textHash } from '@/core/generation/dedup';

export const dynamic = 'force-dynamic';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal('edit'), id: z.coerce.number().int().positive(), text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal('approve'), id: z.coerce.number().int().positive(), scheduledFor: z.string().datetime().optional() }),
  z.object({ action: z.literal('reject'), id: z.coerce.number().int().positive() }),
  z.object({ action: z.literal('retry'), id: z.coerce.number().int().positive() }),
]);

export const POST = guard(async (req) => {
  const b = Body.parse(await req.json());
  const s = await getSettings();
  const checkText = async (text: string, excludeId = 0) => {
    if (text.length > s.maxPostChars) throw new HttpError(400, `text exceeds ${s.maxPostChars} characters`);
    const { rows } = await q<{ text: string }>(`SELECT text FROM drafts WHERE id <> $1 AND status IN ('draft','approved','publishing','published') ORDER BY id DESC LIMIT 300`, [excludeId]);
    if (isNearDuplicate(text, rows.map((r) => r.text), s.similarityThreshold)) throw new HttpError(409, 'duplicate or near-duplicate of existing content');
  };
  if (b.action === 'create') {
    await checkText(b.text);
    const r = await q(`INSERT INTO drafts(kind, text, text_hash) VALUES ('post',$1,$2) RETURNING id`, [b.text, textHash(b.text)]);
    return { id: r.rows[0].id };
  }
  if (b.action === 'edit') {
    await checkText(b.text, b.id);
    const r = await q(`UPDATE drafts SET text=$2, text_hash=$3, updated_at=now() WHERE id=$1 AND status IN ('draft','approved')`, [b.id, b.text, textHash(b.text)]);
    if (!r.rowCount) throw new HttpError(404, 'draft not editable');
    return { ok: true };
  }
  if (b.action === 'approve') {
    const r = await q(`UPDATE drafts SET status='approved', scheduled_for=$2, error=NULL, updated_at=now() WHERE id=$1 AND status='draft'`, [b.id, b.scheduledFor ?? null]);
    if (!r.rowCount) throw new HttpError(404, 'draft not found or not in draft state');
    return { ok: true };
  }
  if (b.action === 'retry') {
    const r = await q(`UPDATE drafts SET status='draft', error=NULL, updated_at=now() WHERE id=$1 AND status='failed'`, [b.id]);
    if (!r.rowCount) throw new HttpError(404, 'draft not found or not failed');
    return { ok: true };
  }
  const r = await q(`UPDATE drafts SET status='rejected', updated_at=now() WHERE id=$1 AND status IN ('draft','approved')`, [b.id]);
  if (!r.rowCount) throw new HttpError(404, 'draft not found');
  return { ok: true };
});
