import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { q } from '@/core/db/pool';

export const dynamic = 'force-dynamic';

/** Schedules a job to run on the worker's next tick (within ~15s). Skipped if the job is currently running. */
export const POST = guard(async (req) => {
  const { name } = z.object({ name: z.string().min(1).max(50) }).strict().parse(await req.json());
  const r = await q(`UPDATE jobs SET next_run_at = now() WHERE name = $1 AND (locked_until IS NULL OR locked_until < now())`, [name]);
  if (!r.rowCount) throw new HttpError(409, 'Unknown job, or it is running right now');
  return { ok: true };
});
