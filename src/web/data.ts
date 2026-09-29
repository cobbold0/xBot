import { q } from '../core/db/pool';
import { usageSummary } from '../core/ai/cost';
import { getControl, getSettings } from '../core/settings';
import { pushConfigured } from '../core/push';
import { credentialInfo } from '../core/x/credentials';
import { startOfDay, startOfMonth } from '../core/time';
import { env } from '../core/config';

export async function getDashboardData() {
  const tz = env().TZ;
  const day = startOfDay(tz);
  const [control, settings, account, jobs, drafts, actions, errors, usage, counts, postStats, costSeries, actionSeries, byPurpose, subs, creds] = await Promise.all([
    getControl(),
    getSettings(),
    q(`SELECT status, username, checked_at, detail FROM account`),
    q(`SELECT name, next_run_at, last_finished_at, last_status, last_error FROM jobs ORDER BY name`),
    q(`SELECT id::int, kind, text, status, scheduled_for, reply_to_x_id, x_id, topic, rationale, error, created_at FROM drafts ORDER BY id DESC LIMIT 80`),
    q(`SELECT id::int, type, target_x_id, status, detail, result_x_id, created_at FROM actions ORDER BY id DESC LIMIT 100`),
    q(`SELECT id::int, source, message, created_at FROM errors ORDER BY id DESC LIMIT 30`),
    usageSummary(),
    q(`SELECT type, count(*)::int n FROM actions WHERE status IN ('attempted','succeeded') AND created_at >= $1 GROUP BY type`, [day]),
    q(`SELECT status, count(*)::int n FROM posts GROUP BY status`),
    q(`SELECT to_char(created_at AT TIME ZONE $1, 'MM-DD') AS d, sum(cost_usd)::float AS cost, sum(input_tokens + output_tokens)::int AS tokens FROM ai_usage WHERE created_at >= now() - interval '14 days' GROUP BY 1 ORDER BY 1`, [tz]),
    q(`SELECT to_char(created_at AT TIME ZONE $1, 'MM-DD') AS d, type, count(*)::int AS n FROM actions WHERE status = 'succeeded' AND created_at >= now() - interval '14 days' GROUP BY 1, 2 ORDER BY 1`, [tz]),
    q(`SELECT purpose AS name, sum(cost_usd)::float AS value FROM ai_usage WHERE created_at >= $1 GROUP BY 1 ORDER BY 2 DESC`, [startOfMonth(tz)]),
    q(`SELECT count(*)::int n FROM push_subscriptions`),
    credentialInfo(),
  ]);
  const pivot = new Map<string, any>();
  for (const r of actionSeries.rows) {
    const row = pivot.get(r.d) ?? { d: r.d, post: 0, reply: 0, like: 0, repost: 0 };
    row[r.type] = r.n;
    pivot.set(r.d, row);
  }
  return {
    control, settings, account: account.rows[0], jobs: jobs.rows, drafts: drafts.rows, actions: actions.rows, errors: errors.rows, usage,
    today: Object.fromEntries(counts.rows.map((r) => [r.type, r.n])) as Record<string, number>,
    posts: Object.fromEntries(postStats.rows.map((r) => [r.status, r.n])) as Record<string, number>,
    series: { cost: costSeries.rows as { d: string; cost: number; tokens: number }[], actions: [...pivot.values()] as { d: string; post: number; reply: number; like: number; repost: number }[], byPurpose: byPurpose.rows as { name: string; value: number }[] },
    credentials: creds,
    push: { configured: pushConfigured(), devices: subs.rows[0].n as number },
  };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
