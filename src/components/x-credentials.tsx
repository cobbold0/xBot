'use client';
import { useState } from 'react';
import { Alert, Badge, Button, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconLogout } from '@tabler/icons-react';
import { api, relTime } from '@/web/client';
import { useDash } from './dash';

/** Pulls auth_token / ct0 / twid out of a pasted "name=value; name=value" cookie string (or base64 of it). */
function parsePasted(input: string): { authToken?: string; ct0?: string; twid?: string } {
  let s = input.trim();
  if (!/auth_token=/.test(s)) { try { const d = atob(s); if (/auth_token=/.test(d)) s = d; } catch { /* not base64 */ } }
  const pick = (n: string) => new RegExp(`(?:^|[;\\s])${n}=([^;\\s]+)`).exec(s)?.[1]?.replace(/^["']|["']$/g, '');
  return { authToken: pick('auth_token'), ct0: pick('ct0'), twid: pick('twid') };
}

export function XCredentials() {
  const { data, act } = useDash();
  const [authToken, setAuthToken] = useState('');
  const [ct0, setCt0] = useState('');
  const [twid, setTwid] = useState('');
  const [busy, setBusy] = useState(false);
  const a = data.account;
  const c = data.credentials;
  const ready = authToken.trim().length >= 10 && ct0.trim().length >= 10 && twid.trim().length >= 3;

  const onPaste = (v: string) => {
    const p = parsePasted(v);
    if (p.authToken) setAuthToken(p.authToken);
    if (p.ct0) setCt0(p.ct0);
    if (p.twid) setTwid(p.twid);
  };

  async function save() {
    setBusy(true);
    const r = await act(api<{ username: string }>('/api/x-credentials', 'PUT', { authToken, ct0, twid }), 'Connected — cookies verified and saved');
    setBusy(false);
    if (r) { setAuthToken(''); setCt0(''); setTwid(''); }
  }

  const remove = () => modals.openConfirmModal({
    title: 'Remove saved cookies?', children: <Text size="sm">The bot falls back to the X_API_KEY environment variable, if set. Otherwise X actions stop.</Text>,
    labels: { confirm: 'Remove', cancel: 'Cancel' }, confirmProps: { color: 'red' },
    onConfirm: () => act(api('/api/x-credentials', 'DELETE'), 'Saved cookies removed'),
  });

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Text size="sm">X:</Text>
        <Badge color={a.status === 'connected' ? 'teal' : 'red'} variant="light" style={{ textTransform: 'none' }}>{a.status}{a.username ? ` · @${a.username}` : ''}</Badge>
      </Group>
      {a.detail && a.status !== 'connected' && <Alert color="red" p="xs"><Text size="xs" style={{ wordBreak: 'break-word' }}>{a.detail}</Text></Alert>}
      <Text size="xs" c="dimmed">
        Source: {c.source === 'dashboard' ? `saved in dashboard (${relTime(c.updatedAt)})` : c.source === 'env' ? 'X_API_KEY environment variable' : 'none configured'}.
        Cookies are verified against X, then stored encrypted in your database and never shown again.
      </Text>

      <Text size="sm" fw={600} mt="xs">{a.status === 'connected' ? 'Replace cookies' : 'Enter your X cookies'}</Text>
      <Text size="xs" c="dimmed">On x.com in a desktop browser: DevTools → Application → Cookies → https://x.com. Copy the values of <b>auth_token</b>, <b>ct0</b> and <b>twid</b> (keep <code>u%3D…</code> as is).</Text>
      <TextInput label="Paste full cookie string (optional)" description="e.g. auth_token=…; ct0=…; twid=… — fills the fields below" placeholder="auth_token=…; ct0=…; twid=…" value="" onChange={(e) => onPaste(e.currentTarget.value)} autoComplete="off" />
      <PasswordInput label="auth_token" value={authToken} onChange={(e) => setAuthToken(e.currentTarget.value)} autoComplete="off" />
      <PasswordInput label="ct0" value={ct0} onChange={(e) => setCt0(e.currentTarget.value)} autoComplete="off" />
      <TextInput label="twid" placeholder="u%3D1234567890" value={twid} onChange={(e) => setTwid(e.currentTarget.value)} autoComplete="off" />
      <Group>
        <Button onClick={save} loading={busy} disabled={!ready}>Verify &amp; save</Button>
        {c.source === 'dashboard' && <Button variant="default" color="red" onClick={remove}>Remove saved</Button>}
      </Group>
      <Text size="xs" c="dimmed">Logging out of x.com invalidates these cookies, so use a dedicated account and avoid logging it out.</Text>

      <Button variant="default" leftSection={<IconLogout size={16} />} mt="sm" onClick={async () => { await api('/api/logout', 'POST'); location.href = '/login'; }}>Sign out of dashboard</Button>
    </Stack>
  );
}
