import { guard, HttpError } from '@/web/api';
import { notify, pushConfigured } from '@/core/push';
export const dynamic = 'force-dynamic';
export const POST = guard(async () => {
  if (!pushConfigured()) throw new HttpError(400, 'VAPID keys are not configured');
  const sent = await notify({ title: 'xBot test', body: 'Notifications are working.', tag: 'test', url: '/' });
  return { sent };
});
