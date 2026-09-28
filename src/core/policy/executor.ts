import { q } from '../db/pool';
import { getControl, recordError, type Settings } from '../settings';
import { startOfDay } from '../time';
import { env } from '../config';
import { XError, type XClient } from '../x/types';

export type ActionType = 'post' | 'like' | 'repost' | 'reply';
export interface ActionRequest { type: ActionType; targetXId?: string; draftId?: number; text?: string }
export interface ActionOutcome {
  status: 'succeeded' | 'dry_run' | 'blocked' | 'failed';
  detail: string;
  resultXId?: string;
  /** true when the request definitely did not reach X and may be retried later */
  retryable?: boolean;
}

const CAPS: Record<ActionType, keyof Settings> = { post: 'maxPostsPerDay', like: 'maxLikesPerDay', repost: 'maxRepostsPerDay', reply: 'maxRepliesPerDay' };
const ENABLED: Record<ActionType, (s: Settings) => boolean> = {
  post: (s) => s.autoPublish, reply: (s) => s.autoPublish, like: (s) => s.autoLike, repost: (s) => s.autoRepost,
};

export class ActionExecutor {
  constructor(private x: () => XClient, private settings: Settings, private tz = env().TZ) {}

  private async log(req: ActionRequest, status: string, detail: string, resultXId?: string) {
    await q('INSERT INTO actions(type, target_x_id, draft_id, status, detail, result_x_id) VALUES ($1,$2,$3,$4,$5,$6)', [req.type, req.targetXId ?? null, req.draftId ?? null, status, detail, resultXId ?? null]);
  }
  private async blocked(req: ActionRequest, detail: string, retryable = true): Promise<ActionOutcome> {
    await this.log(req, 'blocked', detail);
    return { status: 'blocked', detail, retryable };
  }

  async execute(req: ActionRequest): Promise<ActionOutcome> {
    const s = this.settings;
    const c = await getControl();
    if (c.emergencyStop) return this.blocked(req, 'emergency stop is active');
    if (c.paused) return this.blocked(req, 'bot is paused');
    if (!ENABLED[req.type](s)) return this.blocked(req, `${req.type} actions are not enabled`);
    if ((req.type === 'post' || req.type === 'reply') && !req.text) return this.blocked(req, 'no text', false);
    if (req.type === 'post' && req.text!.length > s.maxPostChars) return this.blocked(req, `text exceeds ${s.maxPostChars} chars`, false);
    if (req.type !== 'post' && !req.targetXId) return this.blocked(req, 'missing target', false);

    if (s.dryRun) {
      await this.log(req, 'dry_run', 'dry-run: no write performed');
      return { status: 'dry_run', detail: 'dry-run: no write performed' };
    }

    const cap = Number(s[CAPS[req.type]]);
    const day = startOfDay(this.tz);
    const used = await q<{ n: string }>(`SELECT count(*) n FROM actions WHERE type = $1 AND status IN ('attempted','succeeded') AND created_at >= $2`, [req.type, day]);
    if (Number(used.rows[0].n) >= cap) return this.blocked(req, `daily cap reached (${cap})`);

    const last = await q<{ t: Date }>(`SELECT max(created_at) t FROM actions WHERE status IN ('attempted','succeeded')`);
    if (last.rows[0].t && Date.now() - last.rows[0].t.getTime() < s.minActionSpacingSec * 1000) return this.blocked(req, 'minimum spacing between actions not elapsed');

    // Record the attempt first: the partial unique index makes like/repost idempotent across restarts.
    let attemptId: number;
    try {
      const r = await q<{ id: number }>(`INSERT INTO actions(type, target_x_id, draft_id, status, detail) VALUES ($1,$2,$3,'attempted','sending') RETURNING id`, [req.type, req.targetXId ?? null, req.draftId ?? null]);
      attemptId = r.rows[0].id;
    } catch (e: any) {
      if (e?.code === '23505') return { status: 'blocked', detail: 'already performed on this post', retryable: false };
      throw e;
    }
    const finish = (status: string, detail: string, xid?: string) => q('UPDATE actions SET status=$2, detail=$3, result_x_id=$4 WHERE id=$1', [attemptId, status, detail.slice(0, 500), xid ?? null]);

    try {
      const x = this.x();
      let resultXId: string | undefined;
      if (req.type === 'post') resultXId = await x.post(req.text!);
      else if (req.type === 'reply') resultXId = await x.post(req.text!, { replyTo: req.targetXId });
      else if (req.type === 'like') await x.like(req.targetXId!);
      else await x.repost(req.targetXId!);
      await finish('succeeded', 'confirmed by X', resultXId);
      return { status: 'succeeded', detail: 'confirmed by X', resultXId };
    } catch (e) {
      const xe = e instanceof XError ? e : new XError('unknown', e instanceof Error ? e.message : 'error');
      await finish('failed', `${xe.kind}: ${xe.message}`);
      await recordError('action:' + req.type, xe);
      if (xe.kind === 'auth') await q(`UPDATE account SET status='expired', checked_at=now(), detail=$1`, [xe.message.slice(0, 300)]);
      return { status: 'failed', detail: `${xe.kind}: ${xe.message}`, retryable: xe.kind === 'auth' || xe.kind === 'rate_limit' };
    }
  }
}
