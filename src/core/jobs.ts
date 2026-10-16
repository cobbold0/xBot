import type { LlmClient } from './ai/llm';
import { AiAgent } from './ai/agent';
import { BudgetExceededError } from './ai/cost';
import { analyzePending, discover, draftReplies, verifyAccount } from './discovery/discovery';
import { generateDrafts } from './generation/generate';
import { publishDue } from './generation/publish';
import { ActionExecutor } from './policy/executor';
import { runEngagement } from './policy/engagement';
import type { JobDef } from './scheduler/scheduler';
import { XError, type XClient } from './x/types';
import { log } from './log';
import { notify, notifyOnce } from './push';
import { DEFAULT_TENANT_ID, getTenantId } from './tenant';

export interface Deps { x: () => XClient; llm: () => LlmClient }

const isQuotaError = (e: unknown) => e instanceof Error && /Gemini API (429|503)|quota|RESOURCE_EXHAUSTED/i.test(e.message);

export function buildJobs(d: Deps): JobDef[] {
  const ai = (s: any) => new AiAgent(d.llm(), s);
  const swallowBudgetOrQuota = (name: string) => (e: unknown) => {
    if (e instanceof BudgetExceededError) {
      log.warn(`${name}: ${e.message}; AI operations stopped`);
      void notifyOnce(`budget:${e.scope}:${new Date().toISOString().slice(0, e.scope === 'daily' ? 10 : 7)}`, { title: 'AI budget reached', body: `The ${e.scope} budget is used up; AI jobs are paused until it resets.`, tag: 'budget', url: '/usage' });
      return;
    }
    if (isQuotaError(e)) {
      log.warn(`${name}: Gemini rate/quota limit reached; will retry on next run`);
      return;
    }
    throw e;
  };
  return [
    {
      name: 'account',
      intervalSec: () => 3600,
      runWhilePaused: true,
      run: async () => {
        let client: XClient;
        try {
          client = d.x();
        } catch (e) {
          // If this is a multi-tenant user who hasn't linked X yet, don't fail the global account job
          if (getTenantId() !== DEFAULT_TENANT_ID && e instanceof XError && e.kind === 'auth') return;
          throw e;
        }
        await verifyAccount(client);
      },
    },
    {
      name: 'discover', intervalSec: (s) => s.pollIntervalMin * 60,
      run: async (s) => {
        let xClient: XClient | undefined;
        try { xClient = d.x(); } catch { xClient = undefined; }
        const isMockX = xClient && 'posts' in (xClient as any);
        await discover(xClient, s, !isMockX);
        try {
          await analyzePending(ai(s), s);
          const n = await draftReplies(ai(s), s);
          if (n) await notify({ title: `${n} reply draft${n > 1 ? 's' : ''} to review`, body: 'Suggested replies are waiting for your approval.', tag: 'replies', url: '/drafts' });
        } catch (e) { swallowBudgetOrQuota('discover')(e); }
      },
    },
    { name: 'engage', intervalSec: () => 300, run: async (s) => { await runEngagement(new ActionExecutor(d.x, s), s); } },
    {
      name: 'generate', intervalSec: (s) => s.generateIntervalMin * 60,
      run: async (s) => {
        const userId = getTenantId();
        const day = await (await import('./db/pool')).q<{ n: string }>(`SELECT count(*) n FROM drafts WHERE user_id = $1 AND kind='post' AND status IN ('draft','approved')`, [userId]);
        if (Number(day.rows[0].n) >= 10) return; // don't pile up unreviewed drafts
        try {
          const ids = await generateDrafts(ai(s), s, 2);
          if (ids.length && !s.autoPublish) await notify({ title: `${ids.length} new draft${ids.length > 1 ? 's' : ''} to review`, body: 'Open JustBot to approve or reject.', tag: 'drafts', url: '/drafts' });
        } catch (e) { swallowBudgetOrQuota('generate')(e); }
      },
    },
    { name: 'publish', intervalSec: () => 60, run: async (s) => { await publishDue(new ActionExecutor(d.x, s), s); } },
  ];
}
