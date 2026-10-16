import { q } from '../db/pool';
import { AiAgent } from '../ai/agent';
import { recordError, type Settings } from '../settings';
import { XError, type XClient, type XPost } from '../x/types';
import { BudgetExceededError } from '../ai/cost';
import { notifyOnce } from '../push';
import { getTenantId } from '../tenant';
import { fetchGoogleNews, fetchRedditTrends } from './trends';

async function markAccount(x: XClient) {
  const userId = getTenantId();
  try {
    const u = await x.verify();
    await q(
      `INSERT INTO account(id, user_id, status, username, checked_at, detail)
       VALUES (true, $1, 'connected', $2, now(), NULL)
       ON CONFLICT (user_id) DO UPDATE SET status='connected', username=$2, checked_at=now(), detail=NULL`,
      [userId, u.username],
    );
  } catch (e) {
    const kind = e instanceof XError ? e.kind : 'unknown';
    const status = kind === 'auth' ? 'expired' : 'error';
    const detail = (e instanceof Error ? e.message : 'error').slice(0, 300);
    await q(
      `INSERT INTO account(id, user_id, status, checked_at, detail)
       VALUES (true, $1, $2, now(), $3)
       ON CONFLICT (user_id) DO UPDATE SET status=$2, checked_at=now(), detail=$3`,
      [userId, status, detail],
    );
    await notifyOnce(`account:${status}:${new Date().toISOString().slice(0, 10)}`, { title: status === 'expired' ? 'X session expired' : 'X account error', body: status === 'expired' ? 'Update your X credentials in Settings.' : 'The X connection check failed.', tag: 'account', url: '/settings' });
    throw e;
  }
}
export const verifyAccount = markAccount;

/** Fetches from configured sources (X, Google News, Reddit) and stores unseen posts (dedupe on user_id + x_id) up to the per-run cap. Returns count stored. */
export async function discover(x: XClient | undefined, s: Settings, externalTrends = false): Promise<number> {
  const userId = getTenantId();
  let remaining = s.maxPostsProcessedPerRun;
  let stored = 0;
  const queries = [...new Set([...s.searchTerms, ...s.accounts, ...s.topics])].slice(0, 10);
  const sources: { label: string; fetch: () => Promise<XPost[]> }[] = [
    ...(x ? [
      ...s.searchTerms.map((t) => ({ label: `search:${t}`, fetch: () => x.search({ terms: t, count: 20 }) })),
      ...s.accounts.map((a) => ({ label: `account:${a}`, fetch: () => x.userPosts(a, 20) })),
    ] : []),
    ...(externalTrends ? [
      ...queries.map((qStr) => ({ label: `gnews:${qStr}`, fetch: () => fetchGoogleNews(qStr, 6) })),
      ...queries.map((qStr) => ({ label: `reddit:${qStr}`, fetch: () => fetchRedditTrends(qStr, 6) })),
    ] : []),
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
        `INSERT INTO posts(user_id, x_id, author_id, author_handle, text, metadata, source) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, x_id) DO NOTHING`,
        [userId, p.id, p.authorId, p.authorHandle, p.text, JSON.stringify({ likes: p.likes, reposts: p.reposts, replies: p.replies, views: p.views, createdAt: p.createdAt, lang: p.lang, isReply: p.isReply }), src.label],
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
  const userId = getTenantId();
  const { rows } = await q<PostRow>(`SELECT x_id, text, author_id, author_handle, metadata FROM posts WHERE user_id = $1 AND status='new' AND analysis_attempts < 3 ORDER BY first_seen_at LIMIT $2`, [userId, s.maxPostsProcessedPerRun]);
  let done = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    let results;
    try {
      results = await ai.analyze(batch.map(rowToPost));
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      await recordError('analyze', e);
      await q(`UPDATE posts SET analysis_attempts = analysis_attempts + 1, status = CASE WHEN analysis_attempts + 1 >= 3 THEN 'failed' ELSE status END WHERE user_id = $1 AND x_id = ANY($2)`, [userId, batch.map((b) => b.x_id)]);
      continue;
    }
    for (const b of batch) {
      const a = results.get(b.x_id);
      if (!a) {
        await q(`UPDATE posts SET analysis_attempts = analysis_attempts + 1, status = CASE WHEN analysis_attempts + 1 >= 3 THEN 'failed' ELSE status END WHERE user_id = $1 AND x_id = $2`, [userId, b.x_id]);
        continue;
      }
      await q(`UPDATE posts SET analysis = $3, status = 'analyzed' WHERE user_id = $1 AND x_id = $2`, [userId, b.x_id, JSON.stringify(a)]);
      done++;
    }
  }
  return done;
}

/** Creates reply drafts (for human review only) for analyzed X posts the model flagged and thresholds accept. */
export async function draftReplies(ai: AiAgent, s: Settings, max = 3): Promise<number> {
  if (s.maxRepliesPerDay <= 0) return 0;
  const userId = getTenantId();
  const pending = await q<{ n: string }>(`SELECT count(*) n FROM drafts WHERE user_id = $1 AND kind='reply' AND status='draft'`, [userId]);
  const room = Math.min(max, 10 - Number(pending.rows[0].n));
  if (room <= 0) return 0;
  const { rows } = await q<PostRow>(
    `SELECT x_id, text, author_id, author_handle, metadata FROM posts p WHERE p.user_id = $1 AND status='analyzed'
       AND p.x_id NOT LIKE 'gnews_%' AND p.x_id NOT LIKE 'reddit_%'
       AND analysis->>'suggestedAction' = 'reply_draft' AND (analysis->>'injectionSuspected')::boolean = false
       AND (analysis->>'relevance')::int >= $2 AND (analysis->>'quality')::int >= $3
       AND NOT EXISTS (SELECT 1 FROM drafts d WHERE d.user_id = $1 AND d.kind='reply' AND d.reply_to_x_id = p.x_id)
     ORDER BY first_seen_at DESC LIMIT $4`, [userId, s.minRelevance, s.minQuality, room]);
  let n = 0;
  for (const r of rows) {
    const d = await ai.draftReply(rowToPost(r));
    if (d.text.length > Math.min(s.maxPostChars, 280)) continue;
    const { textHash } = await import('../generation/dedup');
    await q(`INSERT INTO drafts(user_id, kind, text, text_hash, reply_to_x_id, rationale) VALUES ($1,'reply',$2,$3,$4,$5)`, [userId, d.text, textHash(d.text), r.x_id, d.rationale]);
    n++;
  }
  return n;
}
