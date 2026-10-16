'use client';
import { useState } from 'react';
import { Alert, Badge, Box, Button, Divider, Group, Paper, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconLogout, IconQrcode } from '@tabler/icons-react';
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
  const [extMsg, setExtMsg] = useState('');

  // Multi-device Email & Password state
  const [email, setEmail] = useState(data.user?.email ?? '');
  const [password, setPassword] = useState('');
  const [credBusy, setCredBusy] = useState(false);

  // Mobile QR pairing state
  const [qrData, setQrData] = useState<{ code: string; qrSvg: string; expiresAt: string } | null>(null);
  const [qrBusy, setQrBusy] = useState(false);

  const a = data.account;
  const c = data.credentials;
  const ready = authToken.trim().length >= 10 && ct0.trim().length >= 10 && twid.trim().length >= 3;

  const onPaste = (v: string) => {
    const p = parsePasted(v);
    if (p.authToken) setAuthToken(p.authToken);
    if (p.ct0) setCt0(p.ct0);
    if (p.twid) setTwid(p.twid);
  };

  async function save(tokens = { authToken, ct0, twid }) {
    setBusy(true);
    const r = await act(api<{ username: string }>('/api/x-credentials', 'PUT', tokens), 'Connected — cookies verified and saved');
    setBusy(false);
    if (r) { setAuthToken(''); setCt0(''); setTwid(''); setExtMsg(''); }
  }

  function connectViaExtension() {
    setExtMsg('');
    setBusy(true);
    let handled = false;
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== 'JUSTBOT_X_COOKIES_RESULT') return;
      handled = true;
      window.removeEventListener('message', onMessage);
      if (!event.data.ok) {
        setBusy(false);
        setExtMsg(event.data.error || 'Could not read X cookies. Make sure you are logged into x.com in this browser.');
        return;
      }
      await save({ authToken: event.data.authToken, ct0: event.data.ct0, twid: event.data.twid });
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'JUSTBOT_GET_X_COOKIES' }, window.location.origin);
    setTimeout(() => {
      if (!handled) {
        window.removeEventListener('message', onMessage);
        setBusy(false);
        setExtMsg('JustBot Chrome Extension not detected yet. Click "Download Extension (.zip)" below, unzip it, open chrome://extensions → enable Developer mode → click "Load unpacked" and select the unzipped folder.');
      }
    }, 1500);
  }

  async function saveEmailPassword() {
    setCredBusy(true);
    const r = await act(api('/api/auth/set-credentials', 'POST', { email, password }), 'Email & password saved for multi-device login');
    setCredBusy(false);
    if (r) setPassword('');
  }

  async function generateQr() {
    setQrBusy(true);
    const r = await act(api<{ code: string; qrSvg: string; expiresAt: string }>('/api/auth/qr', 'POST', {}));
    setQrBusy(false);
    if (r) setQrData(r);
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
        {data.user?.hasPassword && <Badge color="indigo" variant="outline" size="sm">Email login enabled</Badge>}
      </Group>
      {a.detail && a.status !== 'connected' && <Alert color="red" p="xs"><Text size="xs" style={{ wordBreak: 'break-word' }}>{a.detail}</Text></Alert>}
      <Text size="xs" c="dimmed">
        Source: {c.source === 'dashboard' ? `saved in dashboard (${relTime(c.updatedAt)})` : c.source === 'env' ? 'X_API_KEY environment variable' : 'none configured'}.
        Cookies are verified against X, then stored encrypted (AES-256-GCM) in your database and never shown again.
      </Text>

      <Group mt="xs">
        <Button color="indigo" onClick={connectViaExtension} loading={busy}>1-Click Connect via JustBot Extension</Button>
        <Button component="a" href="/justbot-extension.zip" download="justbot-extension.zip" variant="light">Download Extension (.zip)</Button>
        {c.source === 'dashboard' && <Button variant="default" color="red" onClick={remove}>Remove saved</Button>}
      </Group>
      {extMsg && <Alert color="yellow" p="xs"><Text size="xs">{extMsg}</Text></Alert>}

      <Divider my="xs" label="Mobile QR Code Pairing" labelPosition="left" />
      <Text size="xs" c="dimmed">
        Want to log your phone into JustBot without typing a password? Generate a one-time QR code (also available directly inside the JustBot Chrome Extension popup).
      </Text>
      <Group>
        <Button variant="light" leftSection={<IconQrcode size={16} />} onClick={generateQr} loading={qrBusy}>
          {qrData ? 'Refresh Mobile QR Code' : 'Show Mobile Login QR Code'}
        </Button>
      </Group>
      {qrData && (
        <Paper withBorder p="sm" maw={260}>
          <Stack align="center" gap="xs">
            <Box w={180} h={180} bg="white" p={6} style={{ borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: qrData.qrSvg }} />
            <Text size="sm" fw={700}>6-Digit Code: {qrData.code}</Text>
            <Text size="xs" c="dimmed" ta="center">Scan with your phone camera or enter this 6-digit code on the mobile login screen (valid 5 min).</Text>
          </Stack>
        </Paper>
      )}

      <Divider my="xs" label="Email & Password Fallback (Other Devices)" labelPosition="left" />
      <Text size="xs" c="dimmed">
        Set an email and password on your account so you can sign in from other browsers or devices anytime.
      </Text>
      <TextInput label="Email address" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
      <PasswordInput label="Set / update password (min 8 chars)" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
      <Group>
        <Button variant="default" onClick={saveEmailPassword} loading={credBusy} disabled={!email.includes('@') || password.length < 8}>
          Save Email &amp; Password
        </Button>
      </Group>

      <Divider my="xs" label="Manual X Cookie Entry" labelPosition="left" />
      <Text size="xs" c="dimmed">On x.com in a desktop browser: DevTools → Application → Cookies → https://x.com. Copy the values of <b>auth_token</b>, <b>ct0</b> and <b>twid</b> (keep <code>u%3D…</code> as is).</Text>
      <TextInput label="Paste full cookie string (optional)" description="e.g. auth_token=…; ct0=…; twid=… — fills the fields below" placeholder="auth_token=…; ct0=…; twid=…" value="" onChange={(e) => onPaste(e.currentTarget.value)} autoComplete="off" />
      <PasswordInput label="auth_token" value={authToken} onChange={(e) => setAuthToken(e.currentTarget.value)} autoComplete="off" />
      <PasswordInput label="ct0" value={ct0} onChange={(e) => setCt0(e.currentTarget.value)} autoComplete="off" />
      <TextInput label="twid" placeholder="u%3D1234567890" value={twid} onChange={(e) => setTwid(e.currentTarget.value)} autoComplete="off" />
      <Group>
        <Button variant="default" onClick={() => save()} loading={busy} disabled={!ready}>Verify &amp; save manually</Button>
      </Group>

      <Button variant="default" leftSection={<IconLogout size={16} />} mt="sm" onClick={async () => { await api('/api/logout', 'POST'); location.href = '/login'; }}>Sign out of dashboard</Button>
    </Stack>
  );
}
