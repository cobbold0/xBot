import { env } from '../config';
import { q } from '../db/pool';
import { startOfDay, startOfMonth } from '../time';
import type { Settings } from '../settings';
import { getTenantId } from '../tenant';

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  modelOrEnv?: string | ReturnType<typeof env>,
  maybeEnv?: ReturnType<typeof env>,
): number {
  let model: string | undefined;
  let e: ReturnType<typeof env>;

  if (typeof modelOrEnv === 'string') {
    model = modelOrEnv;
    e = maybeEnv ?? env();
  } else if (modelOrEnv && typeof modelOrEnv === 'object') {
    e = modelOrEnv;
  } else {
    e = env();
  }

  const m = model?.toLowerCase() ?? '';
  if (m.startsWith('gpt-') || m.includes('openai')) {
    const inRate = e.OPENAI_PRICE_INPUT_PER_MTOK ?? 0.15;
    const outRate = e.OPENAI_PRICE_OUTPUT_PER_MTOK ?? 0.60;
    return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
  }
  if (m.startsWith('gemini-')) {
    return (inputTokens * 0.10 + outputTokens * 0.40) / 1_000_000;
  }
  return (inputTokens * e.ANTHROPIC_PRICE_INPUT_PER_MTOK + outputTokens * e.ANTHROPIC_PRICE_OUTPUT_PER_MTOK) / 1_000_000;
}

export async function spendSince(since: Date, userId = getTenantId()): Promise<number> {
  const { rows } = await q<{ s: string }>('SELECT COALESCE(SUM(cost_usd),0) AS s FROM ai_usage WHERE user_id = $1 AND created_at >= $2', [userId, since]);
  return Number(rows[0].s);
}

export async function usageSummary(tz = env().TZ, userId = getTenantId()) {
  const [day, month] = await Promise.all([spendSince(startOfDay(tz), userId), spendSince(startOfMonth(tz), userId)]);
  const t = await q<{ i: string; o: string }>('SELECT COALESCE(SUM(input_tokens),0) i, COALESCE(SUM(output_tokens),0) o FROM ai_usage WHERE user_id = $1 AND created_at >= $2', [userId, startOfMonth(tz)]);
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

export async function recordUsage(purpose: string, model: string, inputTokens: number, outputTokens: number, userId = getTenantId()) {
  await q('INSERT INTO ai_usage(user_id, purpose, model, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5,$6)', [userId, purpose, model, inputTokens, outputTokens, estimateCost(inputTokens, outputTokens, model)]);
}
