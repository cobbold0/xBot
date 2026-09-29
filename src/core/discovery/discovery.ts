import { q } from '../db/pool';
import { AiAgent } from '../ai/agent';
import { recordError, type Settings } from '../settings';
import { XError, type XClient, type XPost } from '../x/types';
import { BudgetExceededError } from '../ai/cost';
import { notifyOnce } from '../push';

async function markAccount(x: XClient) {
  try {
    const u = await x.verify();
    await q(`UPDATE account SET status='connected', username=$1, checked_at=now(), detail=NULL`, [u.username]);
  } catch (e) {
    const kind = e instanceof XError ? e.kind : 'unknown';
    const status = kind === 'auth' ? 'expired' : 'error';
    await q(`UPDATE account SET status=$1, checked_at=now(), detail=$2`, [status, (e instanceof Error ? e.message : 'error').slice(0, 300)]);
    await notifyOnce(`account:${status}:${new Date().toISOString().slice(0, 10)}`, { title: status === 'expired' ? 'X session expired' : 'X account error', body: status === 'expired' ? 'Update X_API_KEY and restart the worker.' : 'The X connection check failed.', tag: 'account', url: '/settings' });
    throw e;
  }
}
export const verifyAccount = markAccount;

/** Fetches from configured sources and stores unseen posts (dedupe on x_id) up to the per-run cap. Returns count stored. */
export async function discover(x: XClient, s: Settings): Promise<number> {
  let remaining = s.maxPostsProcessedPerRun;
  let stored = 0;
  const sources: { label: string; fetch: () => Promise<XPost[]> }[] = [
    ...s.searchTerms.map((t) => ({ label: `search:${t}`, fetch: () => x.search({ terms: t, count: 20 }) })),
    ...s.accounts.map((a) => ({ label: `account:${a}`, fetch: () => x.userPosts(a, 20) })),
  ];
  for (const src of sources) {
    if (remaining <= 0) break;
    let posts: XPost[];
    try {
      posts = await src.fetch();
    } catch (e) {
      await recordError('discover:' + src.label, e);
      if (e instanceof XError && (e.kind === 'auth' || e.kind === 'rate_limit')) throw e;
      continue;
    }
    for (const p of posts) {
      if (remaining <= 0) break;
      if (p.isRepost || !p.text.trim()) continue;
      const r = await q(
        `INSERT INTO posts(x_id, author_id, author_handle, text, metadata, source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (x_id) DO NOTHING`,
        [p.id, p.authorId, p.authorHandle, p.text, JSON.stringify({ likes: p.likes, reposts: p.reposts, replies: p.replies, views: p.views, createdAt: p.createdAt, lang: p.lang, isReply: p.isReply }), src.label],
      );
      if (r.rowCount) { stored++; remaining--; }
    }
  }
  return stored;
}

interface PostRow { x_id: string; text: string; author_id: string; author_handle: string; metadata: any }
const rowToPost = (r: PostRow): XPost => ({ id: r.x_id, text: r.text, authorId: r.author_id, authorHandle: r.author_handle, createdAt: r.metadata.createdAt ?? '', likes: r.metadata.likes ?? 0, reposts: r.metadata.reposts ?? 0, replies: r.metadata.replies ?? 0, views: r.metadata.views, isReply: !!r.metadata.isReply, isRepost: false });

/** Analyzes stored 'new' posts in batches (bounded by per-run cap) and writes validated results. */
export async function analyzePending(ai: AiAgent, s: Settings): Promise<number> {
  const { rows } = await q<PostRow>(`SELECT x_id, text, author_id, author_handle, metadata FROM posts WHERE status='new' AND analysis_attempts < 3 ORDER BY first_seen_at LIMIT $1`, [s.maxPostsProcessedPerRun]);
  let done = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    let results;
    try {
      results = await ai.analyze(batch.map(rowToPost));
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      await recordError('analyze', e);
      await q(`UPDATE posts SET analysis_attempts = analysis_attempts + 1, status = CASE WHEN analysis_attempts + 1 >= 3 THEN 'failed' ELSE status END WHERE x_id = ANY($1)`, [batch.map((b) => b.x_id)]);
      continue;
    }
    for (const b of batch) {
      const a = results.get(b.x_id);
      if (!a) {
        await q(`UPDATE posts SET analysis_attempts = analysis_attempts + 1, status = CASE WHEN analysis_attempts + 1 >= 3 THEN 'failed' ELSE status END WHERE x_id = $1`, [b.x_id]);
        continue;
      }
      await q(`UPDATE posts SET analysis = $2, status = 'analyzed' WHERE x_id = $1`, [b.x_id, JSON.stringify(a)]);
      done++;
    }
  }
  return done;
}

/** Creates reply drafts (for human review only) for analyzed posts the model flagged and thresholds accept. */
export async function draftReplies(ai: AiAgent, s: Settings, max = 3): Promise<number> {
  if (s.maxRepliesPerDay <= 0) return 0;
  const pending = await q<{ n: string }>(`SELECT count(*) n FROM drafts WHERE kind='reply' AND status='draft'`);
  const room = Math.min(max, 10 - Number(pending.rows[0].n));
  if (room <= 0) return 0;
  const { rows } = await q<PostRow>(
    `SELECT x_id, text, author_id, author_handle, metadata FROM posts p WHERE status='analyzed'
       AND analysis->>'suggestedAction' = 'reply_draft' AND (analysis->>'injectionSuspected')::boolean = false
       AND (analysis->>'relevance')::int >= $1 AND (analysis->>'quality')::int >= $2
       AND NOT EXISTS (SELECT 1 FROM drafts d WHERE d.kind='reply' AND d.reply_to_x_id = p.x_id)
     ORDER BY first_seen_at DESC LIMIT $3`, [s.minRelevance, s.minQuality, room]);
  let n = 0;
  for (const r of rows) {
    const d = await ai.draftReply(rowToPost(r));
    if (d.text.length > Math.min(s.maxPostChars, 280)) continue;
    const { textHash } = await import('../generation/dedup');
    await q(`INSERT INTO drafts(kind, text, text_hash, reply_to_x_id, rationale) VALUES ('reply',$1,$2,$3,$4)`, [d.text, textHash(d.text), r.x_id, d.rationale]);
    n++;
  }
  return n;
}
