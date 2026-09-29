'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '@/web/client';
import { useDash } from './dash';

const b64ToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export function PushSettings() {
  const { data, refresh } = useDash();
  const [supported, setSupported] = useState(true);
  const [perm, setPerm] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (!ok) return;
    setPerm(Notification.permission);
    navigator.serviceWorker.getRegistration('/sw.js').then((r) => r?.pushManager.getSubscription()).then((s) => setSubscribed(!!s)).catch(() => {});
  }, []);

  const fail = (e: any) => notifications.show({ title: 'Notifications', message: e.message ?? 'Failed', color: 'red' });

  async function enable() {
    setBusy(true);
    try {
      const { publicKey } = await api<{ publicKey: string | null }>('/api/push/key');
      if (!publicKey) throw new Error('Server has no VAPID keys configured');
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') throw new Error('Permission was not granted');
      const reg = (await navigator.serviceWorker.getRegistration('/sw.js')) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
      await api('/api/push/subscribe', 'POST', sub.toJSON());
      setSubscribed(true);
      await refresh();
      notifications.show({ message: 'Notifications enabled on this device', color: 'teal' });
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await api('/api/push/subscribe', 'DELETE', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setSubscribed(false);
      await refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true);
    try { const r = await api<{ sent: number }>('/api/push/test', 'POST'); notifications.show({ message: r.sent ? 'Test sent' : 'No devices received it', color: r.sent ? 'teal' : 'yellow' }); } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!data.push.configured) return <Alert color="yellow" title="Not configured">Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on the server (run <code>npm run vapid</code>), then redeploy.</Alert>;
  if (!supported) return <Alert color="yellow" title="Not supported here">On iPhone/iPad, add xBot to your Home Screen first (Share → Add to Home Screen), then open it from there.</Alert>;
  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">Get alerts for new drafts, published posts, failures, expired sessions and budget limits. {data.push.devices} device(s) subscribed.</Text>
      {perm === 'denied' && <Alert color="red">Notifications are blocked in your browser settings for this site.</Alert>}
      <Group>
        {subscribed ? <Button variant="default" loading={busy} onClick={disable}>Disable on this device</Button> : <Button loading={busy} onClick={enable} disabled={perm === 'denied'}>Enable on this device</Button>}
        <Button variant="light" loading={busy} onClick={test} disabled={data.push.devices === 0}>Send test</Button>
      </Group>
    </Stack>
  );
}
