import { randomUUID } from 'node:crypto';
import { q } from '../db/pool';
import { redact } from '../log';
import { defaultSettings, getControl, getSettings, recordError, type Settings } from '../settings';
import { listTenantIds, runWithTenant } from '../tenant';

export interface JobDef {
  name: string;
  intervalSec: (s: Settings) => number;
  /** If true, runs even when paused (read-only maintenance). Never runs during emergency stop. */
  runWhilePaused?: boolean;
  run: (s: Settings) => Promise<void>;
}

const LOCK_SECONDS = 600;
/** A failed job retries after at most this long (not its full interval), so transient failures recover quickly. */
const ERROR_RETRY_SECONDS = 900;

export class Scheduler {
  readonly id = randomUUID();
  lastTickAt = Date.now();
  constructor(private jobs: JobDef[]) {}

  async init() {
    for (const j of this.jobs) await q('INSERT INTO jobs(name) VALUES ($1) ON CONFLICT DO NOTHING', [j.name]);
    // Recovery: locks held by dead workers simply expire (locked_until); clear any that are already stale now.
    await q(`UPDATE jobs SET locked_until = NULL, locked_by = NULL, last_status = 'recovered' WHERE locked_until IS NOT NULL AND locked_until < now()`);
  }

  /** Atomically claims one due, unlocked job. Safe with multiple workers. */
  async claim(): Promise<JobDef | undefined> {
    const { rows } = await q<{ name: string }>(
      `UPDATE jobs SET locked_until = now() + make_interval(secs => $1), locked_by = $2, last_started_at = now()
       WHERE name = (SELECT name FROM jobs WHERE next_run_at <= now() AND (locked_until IS NULL OR locked_until < now()) AND name = ANY($3)
                     ORDER BY next_run_at LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING name`,
      [LOCK_SECONDS, this.id, this.jobs.map((j) => j.name)],
    );
    return rows[0] && this.jobs.find((j) => j.name === rows[0].name);
  }

  private async release(job: JobDef, s: Settings, status: string, error?: string) {
    await q(
      `UPDATE jobs SET locked_until = NULL, locked_by = NULL, last_finished_at = now(), last_status = $2, last_error = $3, next_run_at = now() + make_interval(secs => $4)
       WHERE name = $1 AND locked_by = $5`,
      [job.name, status, error ? redact(error).slice(0, 500) : null, status === 'error' ? Math.min(job.intervalSec(s), ERROR_RETRY_SECONDS) : job.intervalSec(s), this.id],
    );
  }

  /** Runs every currently-due job once across all active tenants. Returns the job names executed. */
  async tick(): Promise<string[]> {
    this.lastTickAt = Date.now();
    const ran: string[] = [];
    for (let i = 0; i < this.jobs.length; i++) {
      const job = await this.claim();
      if (!job) break;
      const tenants = await listTenantIds();
      let lastSettings: Settings = defaultSettings();
      let anyRan = false;
      let anyError: string | undefined;
      let skipReason: string | undefined;
      let successCount = 0;
      let failureCount = 0;

      for (const userId of tenants) {
        await runWithTenant(userId, async () => {
          const s = await getSettings(userId);
          lastSettings = s;
          const c = await getControl(userId);
          if (c.emergencyStop || (c.paused && !job.runWhilePaused)) {
            skipReason = c.emergencyStop ? 'emergency stop' : 'paused';
            return;
          }
          anyRan = true;
          try {
            await job.run(s);
            successCount++;
          } catch (e) {
            failureCount++;
            await recordError('job:' + job.name, e, userId);
            anyError = e instanceof Error ? e.message : 'error';
          }
        });
      }

      if (!anyRan && skipReason) {
        await this.release(job, lastSettings, 'skipped', skipReason);
        continue;
      }
      if (failureCount > 0 && successCount === 0) {
        await this.release(job, lastSettings, 'error', anyError);
      } else {
        await this.release(job, lastSettings, 'ok');
      }
      ran.push(job.name);
    }
    return ran;
  }
}
