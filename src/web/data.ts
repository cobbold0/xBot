import { q } from '../core/db/pool';
import { usageSummary } from '../core/ai/cost';
import { getControl, getSettings } from '../core/settings';
import { startOfDay } from '../core/time';
import { env } from '../core/config';

export async function getDashboardData() {
  const day = startOfDay(env().TZ);
  const [control, settings, account, jobs, drafts, actions, errors, usage, counts, postStats] = await Promise.all([
    getControl(),
    getSettings(),
    q(`SELECT status, username, checked_at, detail FROM account`),
    q(`SELECT name, next_run_at, last_finished_at, last_status, last_error FROM jobs ORDER BY name`),
    q(`SELECT id, kind, text, status, scheduled_for, reply_to_x_id, x_id, topic, rationale, error, created_at FROM drafts ORDER BY id DESC LIMIT 40`),
    q(`SELECT id, type, target_x_id, status, detail, result_x_id, created_at FROM actions ORDER BY id DESC LIMIT 40`),
    q(`SELECT id, source, message, created_at FROM errors ORDER BY id DESC LIMIT 15`),
    usageSummary(),
    q(`SELECT type, count(*)::int n FROM actions WHERE status IN ('attempted','succeeded') AND created_at >= $1 GROUP BY type`, [day]),
    q(`SELECT status, count(*)::int n FROM posts GROUP BY status`),
  ]);
  return {
    control, settings, account: account.rows[0], jobs: jobs.rows, drafts: drafts.rows, actions: actions.rows, errors: errors.rows, usage,
    today: Object.fromEntries(counts.rows.map((r) => [r.type, r.n])), posts: Object.fromEntries(postStats.rows.map((r) => [r.status, r.n])),
  };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
