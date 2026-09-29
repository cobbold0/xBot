import webpush from 'web-push';
import { env } from './config';
import { q } from './db/pool';
import { log } from './log';

export interface PushPayload { title: string; body: string; tag?: string; url?: string }

export function pushConfigured(): boolean {
  const e = env();
  return !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}

/** Sends to every subscribed device. Never throws; dead subscriptions (404/410) are removed. Returns delivered count. */
export async function notify(p: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const e = env();
  try {
    const { rows } = await q<{ endpoint: string; p256dh: string; auth: string }>('SELECT endpoint, p256dh, auth FROM push_subscriptions');
    let sent = 0;
    await Promise.all(rows.map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, JSON.stringify({ url: '/', ...p }), {
          vapidDetails: { subject: e.VAPID_SUBJECT, publicKey: e.VAPID_PUBLIC_KEY!, privateKey: e.VAPID_PRIVATE_KEY! }, TTL: 3600,
        });
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) await q('DELETE FROM push_subscriptions WHERE endpoint = $1', [r.endpoint]);
        else log.warn('push failed', { status: err?.statusCode });
      }
    }));
    return sent;
  } catch (err) {
    log.warn('push error', err);
    return 0;
  }
}

/** Notifies at most once per key (e.g. one budget alert per day). */
export async function notifyOnce(key: string, p: PushPayload): Promise<boolean> {
  const r = await q(`INSERT INTO settings(key, value) VALUES ($1, 'true') ON CONFLICT (key) DO NOTHING`, ['notified:' + key]);
  if (!r.rowCount) return false;
  await notify(p);
  return true;
}
