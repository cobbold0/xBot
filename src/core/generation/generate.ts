import { q } from '../db/pool';
import { AiAgent } from '../ai/agent';
import type { Settings } from '../settings';
import { isNearDuplicate, textHash } from './dedup';
import type { XPost } from '../x/types';

/** Generates original post drafts, rejecting over-length and near-duplicate text. Returns ids created. */
export async function generateDrafts(ai: AiAgent, s: Settings, count = 2): Promise<number[]> {
  if (!s.topics.length) return [];
  const { rows: hist } = await q<{ text: string }>(`SELECT text FROM drafts WHERE kind='post' AND status <> 'rejected' ORDER BY created_at DESC LIMIT 200`);
  const known = hist.map((r) => r.text);
  const { rows: insp } = await q<any>(`SELECT x_id, text, author_handle, metadata FROM posts WHERE status='analyzed' AND (analysis->>'injectionSuspected')::boolean = false ORDER BY first_seen_at DESC LIMIT 8`);
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
      `INSERT INTO drafts(kind, text, text_hash, topic, rationale, status, scheduled_for) VALUES ('post',$1,$2,$3,$4,$5, CASE WHEN $5='approved' THEN now() + make_interval(mins => $6) END) RETURNING id`,
      [text, textHash(text), g.topic, g.rationale, s.autoPublish ? 'approved' : 'draft', jitterMin],
    );
    known.push(text);
    ids.push(r.rows[0].id);
  }
  return ids;
}
