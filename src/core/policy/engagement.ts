import { q } from '../db/pool';
import type { Settings } from '../settings';
import { ActionExecutor, type ActionType } from './executor';
import { getTenantId } from '../tenant';

export interface Candidate { x_id: string; analysis: { relevance: number; quality: number; engagementSuitable: boolean; suggestedAction: string; injectionSuspected: boolean } }

/** Pure policy: which action (if any) the agent may take on an analyzed post. */
export function decideEngagement(c: Candidate, s: Settings): ActionType | null {
  if (c.x_id.startsWith('gnews_') || c.x_id.startsWith('reddit_')) return null;
  const a = c.analysis;
  if (a.injectionSuspected || !a.engagementSuitable) return null;
  if (a.relevance < s.minRelevance || a.quality < s.minQuality) return null;
  if (a.suggestedAction === 'like' && s.autoLike) return 'like';
  if (a.suggestedAction === 'repost' && s.autoRepost) return 'repost';
  return null;
}

export async function runEngagement(exec: ActionExecutor, s: Settings): Promise<number> {
  if (!s.autoLike && !s.autoRepost) return 0;
  const userId = getTenantId();
  const { rows } = await q<Candidate>(
    `SELECT x_id, analysis FROM posts p WHERE p.user_id = $1 AND status='analyzed' AND analysis->>'suggestedAction' IN ('like','repost')
       AND NOT EXISTS (SELECT 1 FROM actions a WHERE a.user_id = $1 AND a.target_x_id = p.x_id AND a.type IN ('like','repost') AND a.status IN ('attempted','succeeded','dry_run','failed'))
     ORDER BY first_seen_at DESC LIMIT 20`,
    [userId],
  );
  let done = 0;
  for (const c of rows) {
    const type = decideEngagement(c, s);
    if (!type) continue;
    const r = await exec.execute({ type, targetXId: c.x_id });
    if (r.status === 'succeeded' || r.status === 'dry_run') done++;
    if (r.status === 'blocked' && r.retryable) break; // cap, spacing, pause: stop this run
    if (r.status === 'failed' && r.retryable) break;
  }
  return done;
}
