import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { q } from '@/core/db/pool';
import { getTenantId } from '@/core/tenant';

export const dynamic = 'force-dynamic';

const FeedbackSchema = z.object({
  targetType: z.enum(['action', 'draft']),
  targetId: z.number().int().positive(),
  rating: z.number().int().min(-1).max(5),
  note: z.string().trim().max(500).optional(),
}).strict();

export const POST = guard(async (req) => {
  const userId = getTenantId();
  const { targetType, targetId, rating, note } = FeedbackSchema.parse(await req.json());

  const { rows } = await q(
    `INSERT INTO feedback (user_id, target_type, target_id, rating, note, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id, target_type, target_id)
     DO UPDATE SET rating = EXCLUDED.rating, note = EXCLUDED.note, updated_at = now()
     RETURNING id::int, user_id, target_type, target_id::int, rating, note, created_at, updated_at`,
    [userId, targetType, targetId, rating, note ?? null],
  );

  return { ok: true, feedback: rows[0] };
});

export const GET = guard(async (req) => {
  const userId = getTenantId();
  const url = new URL(req.url);
  const targetType = url.searchParams.get('targetType');
  const targetId = url.searchParams.get('targetId');

  let sql = `SELECT id::int, user_id, target_type, target_id::int, rating, note, created_at, updated_at FROM feedback WHERE user_id = $1`;
  const params: any[] = [userId];

  if (targetType) {
    params.push(targetType);
    sql += ` AND target_type = $${params.length}`;
  }
  if (targetId) {
    params.push(parseInt(targetId, 10));
    sql += ` AND target_id = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC LIMIT 100`;

  const { rows } = await q(sql, params);
  return { ok: true, feedback: rows };
});
