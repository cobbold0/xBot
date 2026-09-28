import type { LlmClient } from './ai/llm';
import { AiAgent } from './ai/agent';
import { BudgetExceededError } from './ai/cost';
import { analyzePending, discover, draftReplies, verifyAccount } from './discovery/discovery';
import { generateDrafts } from './generation/generate';
import { publishDue } from './generation/publish';
import { ActionExecutor } from './policy/executor';
import { runEngagement } from './policy/engagement';
import type { JobDef } from './scheduler/scheduler';
import type { XClient } from './x/types';
import { log } from './log';

export interface Deps { x: () => XClient; llm: () => LlmClient }

export function buildJobs(d: Deps): JobDef[] {
  const ai = (s: any) => new AiAgent(d.llm(), s);
  const swallowBudget = (name: string) => (e: unknown) => {
    if (e instanceof BudgetExceededError) { log.warn(`${name}: ${e.message}; AI operations stopped`); return; }
    throw e;
  };
  return [
    { name: 'account', intervalSec: () => 3600, runWhilePaused: true, run: async () => { await verifyAccount(d.x()); } },
    {
      name: 'discover', intervalSec: (s) => s.pollIntervalMin * 60,
      run: async (s) => {
        await discover(d.x(), s);
        try { await analyzePending(ai(s), s); await draftReplies(ai(s), s); } catch (e) { swallowBudget('discover')(e); }
      },
    },
    { name: 'engage', intervalSec: () => 300, run: async (s) => { await runEngagement(new ActionExecutor(d.x, s), s); } },
    {
      name: 'generate', intervalSec: (s) => s.generateIntervalMin * 60,
      run: async (s) => {
        const day = await (await import('./db/pool')).q<{ n: string }>(`SELECT count(*) n FROM drafts WHERE kind='post' AND status IN ('draft','approved')`);
        if (Number(day.rows[0].n) >= 10) return; // don't pile up unreviewed drafts
        try { await generateDrafts(ai(s), s, 2); } catch (e) { swallowBudget('generate')(e); }
      },
    },
    { name: 'publish', intervalSec: () => 60, run: async (s) => { await publishDue(new ActionExecutor(d.x, s), s); } },
  ];
}
