import { z } from 'zod';
import { guard } from '@/web/api';
import { getControl, setControl } from '@/core/settings';
export const dynamic = 'force-dynamic';
export const POST = guard(async (req) => {
  const body = z.object({ paused: z.boolean().optional(), emergencyStop: z.boolean().optional() }).strict().parse(await req.json());
  await setControl(body);
  return getControl();
});
