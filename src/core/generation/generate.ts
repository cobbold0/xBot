import { q } from '../db/pool';
import { AiAgent } from '../ai/agent';
import type { Settings } from '../settings';
import { isNearDuplicate, textHash } from './dedup';
import type { XPost } from '../x/types';
import { getTenantId } from '../tenant';

/** Generates original post drafts for the current tenant, rejecting over-length and near-duplicate text. Returns ids created. */
export async function generateDrafts(ai: AiAgent, s: Settings, count = 2): Promise<number[]> {
  if (!s.topics.length && !s.accounts.length && !s.searchTerms.length) return [];
  const userId = getTenantId();
  const { rows: hist } = await q<{ text: string }>(`SELECT text FROM drafts WHERE user_id = $1 AND kind='post' AND status <> 'rejected' ORDER BY created_at DESC LIMIT 200`, [userId]);
  const known = hist.map((r) => r.text);
  const { rows: insp } = await q<any>(
    `SELECT x_id, text, author_handle, metadata FROM posts
     WHERE user_id = $1 AND status='analyzed' AND (analysis->>'injectionSuspected')::boolean = false
     ORDER BY (COALESCE((metadata->>'likes')::int, 0) + COALESCE((metadata->>'reposts')::int, 0) * 2) DESC, first_seen_at DESC
     LIMIT 8`,
    [userId],
  );
  const inspiration: XPost[] = insp.map((r: any) => ({ id: r.x_id, text: r.text, authorId: '', authorHandle: r.author_handle ?? '', createdAt: '', likes: r.metadata?.likes ?? 0, reposts: r.metadata?.reposts ?? 0, replies: 0, isReply: false, isRepost: false }));
  const generated = await ai.generatePosts(count, known, inspiration);
  const ids: number[] = [];
  for (const g of generated) {
    const text = g.text.trim();
    if (!text || text.length > s.maxPostChars) continue;
    if (isNearDuplicate(text, known, s.similarityThreshold)) continue;
    // Auto-publish mode schedules with jitter; otherwise stays a draft awaiting human approval.
    const jitterMin = Math.floor(Math.random() * 30);
    const r = await q<{ id: number }>(
      `INSERT INTO drafts(user_id, kind, text, text_hash, topic, rationale, media_type, media_prompt, status, scheduled_for) VALUES ($1,'post',$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8='approved' THEN now() + make_interval(mins => $9) END) RETURNING id`,
      [userId, text, textHash(text), g.topic, g.rationale, g.mediaType ?? 'image', g.mediaPrompt || null, s.autoPublish ? 'approved' : 'draft', jitterMin],
    );
    known.push(text);
    ids.push(r.rows[0].id);
  }
  return ids;
}
