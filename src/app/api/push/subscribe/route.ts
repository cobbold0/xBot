import { z } from 'zod';
import { guard } from '@/web/api';
import { q } from '@/core/db/pool';
import { getTenantId } from '@/core/tenant';

export const dynamic = 'force-dynamic';

const Sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });
export const POST = guard(async (req) => {
  const userId = getTenantId();
  const s = Sub.parse(await req.json());
  await q(
    `INSERT INTO push_subscriptions(endpoint, user_id, p256dh, auth) VALUES ($1,$2,$3,$4) ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4`,
    [s.endpoint, userId, s.keys.p256dh, s.keys.auth],
  );
  return { ok: true };
});
export const DELETE = guard(async (req) => {
  const userId = getTenantId();
  const { endpoint } = z.object({ endpoint: z.string().url().max(1000) }).parse(await req.json());
  await q('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, userId]);
  return { ok: true };
});
