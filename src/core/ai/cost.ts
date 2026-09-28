import { env } from '../config';
import { q } from '../db/pool';
import { startOfDay, startOfMonth } from '../time';
import type { Settings } from '../settings';

export function estimateCost(inputTokens: number, outputTokens: number, e = env()): number {
  return (inputTokens * e.ANTHROPIC_PRICE_INPUT_PER_MTOK + outputTokens * e.ANTHROPIC_PRICE_OUTPUT_PER_MTOK) / 1_000_000;
}

export async function spendSince(since: Date): Promise<number> {
  const { rows } = await q<{ s: string }>('SELECT COALESCE(SUM(cost_usd),0) AS s FROM ai_usage WHERE created_at >= $1', [since]);
  return Number(rows[0].s);
}

export async function usageSummary(tz = env().TZ) {
  const [day, month] = await Promise.all([spendSince(startOfDay(tz)), spendSince(startOfMonth(tz))]);
  const t = await q<{ i: string; o: string }>('SELECT COALESCE(SUM(input_tokens),0) i, COALESCE(SUM(output_tokens),0) o FROM ai_usage WHERE created_at >= $1', [startOfMonth(tz)]);
  return { dayUsd: day, monthUsd: month, monthInputTokens: Number(t.rows[0].i), monthOutputTokens: Number(t.rows[0].o) };
}

export class BudgetExceededError extends Error {
  constructor(public scope: 'daily' | 'monthly') { super(`${scope} AI budget reached`); this.name = 'BudgetExceededError'; }
}

export async function assertBudget(s: Settings, tz = env().TZ) {
  const u = await usageSummary(tz);
  if (u.dayUsd >= s.dailyBudgetUsd) throw new BudgetExceededError('daily');
  if (u.monthUsd >= s.monthlyBudgetUsd) throw new BudgetExceededError('monthly');
}

export async function recordUsage(purpose: string, model: string, inputTokens: number, outputTokens: number) {
  await q('INSERT INTO ai_usage(purpose, model, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5)', [purpose, model, inputTokens, outputTokens, estimateCost(inputTokens, outputTokens)]);
}
