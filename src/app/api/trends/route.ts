import { z } from 'zod';
import { guard } from '@/web/api';
import { q } from '@/core/db/pool';
import { getTenantId } from '@/core/tenant';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  platform: z.enum(['all', 'x', 'gnews', 'reddit']).default('all'),
  timeframe: z.enum(['24h', '7d', '30d']).default('30d'),
  search: z.string().trim().max(100).optional(),
});

export const GET = guard(async (req) => {
  const userId = getTenantId();
  const url = new URL(req.url);
  const { platform, timeframe, search } = QuerySchema.parse({
    platform: url.searchParams.get('platform') || 'all',
    timeframe: url.searchParams.get('timeframe') || '30d',
    search: url.searchParams.get('search') || undefined,
  });

  const timeInterval = timeframe === '24h' ? '24 hours' : timeframe === '7d' ? '7 days' : '30 days';

  let platformFilter = '';
  if (platform === 'x') {
    platformFilter = "AND p.source NOT LIKE 'gnews:%' AND p.source NOT LIKE 'reddit:%'";
  } else if (platform === 'gnews') {
    platformFilter = "AND p.source LIKE 'gnews:%'";
  } else if (platform === 'reddit') {
    platformFilter = "AND p.source LIKE 'reddit:%'";
  }

  const params: any[] = [userId];
  let searchFilter = '';
  if (search) {
    params.push(`%${search}%`);
    searchFilter = `AND (p.text ILIKE $${params.length} OR p.author_handle ILIKE $${params.length} OR (p.analysis->>'topic') ILIKE $${params.length})`;
  }

  const sql = `
    SELECT
      p.id::int,
      p.x_id,
      p.author_handle,
      p.text,
      p.source,
      p.metadata,
      p.analysis,
      p.status,
      p.first_seen_at,
      ROUND(
        (
          COALESCE((p.metadata->>'likes')::numeric, 0) +
          (COALESCE((p.metadata->>'replies')::numeric, 0) * 2) +
          (COALESCE((p.metadata->>'reposts')::numeric, 0) * 3)
        ) /
        POWER((EXTRACT(EPOCH FROM (now() - p.first_seen_at)) / 3600.0 + 2.0), 1.2),
        2
      ) AS trending_score,
      EXISTS(SELECT 1 FROM drafts d WHERE d.user_id = p.user_id AND (d.reply_to_x_id = p.x_id OR d.text ILIKE '%' || SUBSTRING(p.text FROM 1 FOR 30) || '%')) AS has_draft
    FROM posts p
    WHERE p.user_id = $1
      AND p.first_seen_at >= now() - interval '${timeInterval}'
      ${platformFilter}
      ${searchFilter}
    ORDER BY trending_score DESC, p.first_seen_at DESC
    LIMIT 60
  `;

  const { rows } = await q(sql, params);
  return { ok: true, posts: rows };
});
