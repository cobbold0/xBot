import { z } from 'zod';
import { guard } from '@/web/api';
import { q } from '@/core/db/pool';
export const dynamic = 'force-dynamic';

const Sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });
export const POST = guard(async (req) => {
  const s = Sub.parse(await req.json());
  await q(`INSERT INTO push_subscriptions(endpoint, p256dh, auth) VALUES ($1,$2,$3) ON CONFLICT (endpoint) DO UPDATE SET p256dh = $2, auth = $3`, [s.endpoint, s.keys.p256dh, s.keys.auth]);
  return { ok: true };
});
export const DELETE = guard(async (req) => {
  const { endpoint } = z.object({ endpoint: z.string().url().max(1000) }).parse(await req.json());
  await q('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  return { ok: true };
});
