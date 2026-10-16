'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, Anchor, Badge, Button, Center, Divider, Group, Paper, PasswordInput, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';

function parsePastedCookies(input: string): { authToken?: string; ct0?: string; twid?: string } {
  let s = input.trim();
  if (!/auth_token=/.test(s)) {
    try { const d = atob(s); if (/auth_token=/.test(d)) s = d; } catch { /* ignore */ }
  }
  const pick = (n: string) => new RegExp(`(?:^|[;\\s])${n}=([^;\\s]+)`).exec(s)?.[1]?.replace(/^["']|["']$/g, '');
  return { authToken: pick('auth_token'), ct0: pick('ct0'), twid: pick('twid') };
}

export default function Login() {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [tab, setTab] = useState<'x' | 'email' | 'code'>('x');
  const [useServerKey, setUseServerKey] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cookiePaste, setCookiePaste] = useState('');
  const [pairCode, setPairCode] = useState('');

  async function signInWithXTokens(tokens: { authToken: string; ct0: string; twid: string }) {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/auth/x-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tokens),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      location.href = '/';
    } else {
      setErr(data.error || 'Could not verify X credentials.');
      setBusy(false);
    }
  }

  function signInViaExtension() {
    setErr('');
    setBusy(true);
    let handled = false;
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== 'JUSTBOT_X_COOKIES_RESULT') return;
      handled = true;
      window.removeEventListener('message', onMessage);
      if (!event.data.ok) {
        setBusy(false);
        setErr(event.data.error || 'Active X session not found. Please log in to x.com in this browser first.');
        return;
      }
      await signInWithXTokens({
        authToken: event.data.authToken,
        ct0: event.data.ct0,
        twid: event.data.twid,
      });
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'JUSTBOT_GET_X_COOKIES' }, window.location.origin);
    setTimeout(() => {
      if (!handled) {
        window.removeEventListener('message', onMessage);
        setBusy(false);
        setErr('JustBot Extension not detected. Click "Download Extension (.zip)" below to load it in chrome://extensions, or paste your X cookies.');
      }
    }, 1500);
  }

  async function submitPastedCookies(e: React.FormEvent) {
    e.preventDefault();
    const p = parsePastedCookies(cookiePaste);
    if (!p.authToken || !p.ct0 || !p.twid) {
      setErr('Please paste a valid cookie string containing auth_token, ct0, and twid.');
      return;
    }
    await signInWithXTokens({ authToken: p.authToken, ct0: p.ct0, twid: p.twid });
  }

  async function submitEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const fd = new FormData(e.currentTarget);
    if (useServerKey && authMode === 'signin') {
      const password = fd.get('password');
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (r.ok) location.href = '/';
      else { setErr(r.status === 429 ? 'Too many attempts. Try again later.' : 'Invalid admin passphrase'); setBusy(false); }
      return;
    }

    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const name = String(fd.get('name') || '').trim();
    const r = await fetch('/api/auth/email-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, mode: authMode, ...(name ? { name } : {}) }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) location.href = '/';
    else { setErr(data.error || 'Authentication failed'); setBusy(false); }
  }

  async function submitPairCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const r = await fetch('/api/auth/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: pairCode.trim() }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) location.href = '/';
    else { setErr(data.error || 'Invalid or expired 6-digit code'); setBusy(false); }
  }

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder p="lg" w="100%" maw={420}>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Stack gap={0}>
              <Title order={2}>JustBot</Title>
              <Text size="xs" c="dimmed">Trending News &amp; X Agent</Text>
            </Stack>
            <Badge variant="light" color={authMode === 'signup' ? 'teal' : 'indigo'}>
              {authMode === 'signup' ? 'Create Account' : 'Sign In'}
            </Badge>
          </Group>

          <SegmentedControl
            fullWidth
            color={authMode === 'signup' ? 'teal' : 'indigo'}
            value={authMode}
            onChange={(v) => {
              const next = v as 'signin' | 'signup';
              setAuthMode(next);
              setErr('');
              if (next === 'signup' && tab === 'code') setTab('email');
            }}
            data={[
              { value: 'signin', label: 'Sign In' },
              { value: 'signup', label: 'Sign Up (New Account)' },
            ]}
          />

          <SegmentedControl
            fullWidth
            size="xs"
            value={tab}
            onChange={(v) => { setTab(v as any); setErr(''); }}
            data={
              authMode === 'signup'
                ? [
                    { value: 'x', label: 'Sign Up with X' },
                    { value: 'email', label: 'Sign Up with Email' },
                  ]
                : [
                    { value: 'x', label: 'X Extension' },
                    { value: 'email', label: 'Email' },
                    { value: 'code', label: 'QR / Code' },
                  ]
            }
          />

          {err && <Alert color="red" p="xs"><Text size="xs">{err}</Text></Alert>}

          {tab === 'x' && (
            <Stack gap="sm">
              <Text size="xs" c="dimmed">
                {authMode === 'signup'
                  ? 'Create a brand-new isolated JustBot account using the X account currently logged into this browser.'
                  : 'Sign in with 1 click using your active X session in this browser. If this X handle is new to JustBot, an isolated account will be created automatically.'}
              </Text>
              <Button color={authMode === 'signup' ? 'teal' : 'indigo'} size="md" onClick={signInViaExtension} loading={busy}>
                {authMode === 'signup' ? '1-Click Sign Up with X (Extension)' : '1-Click Sign In with X (Extension)'}
              </Button>
              <Button component="a" href="/justbot-extension.zip" download="justbot-extension.zip" variant="light" size="xs">
                Download JustBot Chrome Extension (.zip)
              </Button>

              <Divider label="Or paste X cookies" labelPosition="center" my={4} />
              <form onSubmit={submitPastedCookies}>
                <Stack gap="xs">
                  <TextInput
                    placeholder="auth_token=…; ct0=…; twid=…"
                    value={cookiePaste}
                    onChange={(e) => setCookiePaste(e.currentTarget.value)}
                    autoComplete="off"
                  />
                  <Button type="submit" variant="default" size="xs" loading={busy} disabled={!cookiePaste.trim()}>
                    {authMode === 'signup' ? 'Verify & Create Account with Cookies' : 'Verify & Sign In with Cookies'}
                  </Button>
                </Stack>
              </form>

              <Divider my={2} />
              <Button
                variant="subtle"
                size="xs"
                onClick={() => {
                  setAuthMode('signup');
                  setTab('email');
                  setErr('');
                }}
              >
                Want to sign up with Email &amp; Password instead? Click here →
              </Button>
            </Stack>
          )}

          {tab === 'email' && (
            <form onSubmit={submitEmail}>
              <Stack gap="sm">
                {authMode === 'signup' && (
                  <Text size="xs" c="dimmed">
                    Create a standalone JustBot account with its own isolated settings, scraped trends, drafts, and X connection.
                  </Text>
                )}
                {authMode === 'signup' && (
                  <TextInput name="name" label="Name or Handle" placeholder="e.g. Alex or @alex" required />
                )}
                {(!useServerKey || authMode === 'signup') && (
                  <TextInput name="email" type="email" label="Email" placeholder="you@example.com" required autoComplete="email" />
                )}
                <PasswordInput
                  name="password"
                  label={useServerKey && authMode === 'signin' ? 'Server Dashboard Passphrase' : 'Password (min 8 chars)'}
                  required
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                />
                <Button type="submit" color={authMode === 'signup' ? 'teal' : 'indigo'} loading={busy}>
                  {authMode === 'signup' ? 'Create Account & Sign In' : 'Sign In'}
                </Button>
                {authMode === 'signin' && (
                  <Group justify="space-between">
                    <Anchor component="button" type="button" size="xs" onClick={() => { setAuthMode('signup'); setErr(''); }}>
                      Don&apos;t have an account? Sign Up
                    </Anchor>
                    <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => { setUseServerKey((v) => !v); setErr(''); }}>
                      {useServerKey ? 'Use Email & Password' : 'Use Server Passphrase'}
                    </Anchor>
                  </Group>
                )}
                {authMode === 'signup' && (
                  <Anchor component="button" type="button" size="xs" ta="center" onClick={() => { setAuthMode('signin'); setErr(''); }}>
                    Already have an account? Sign In
                  </Anchor>
                )}
              </Stack>
            </form>
          )}

          {tab === 'code' && authMode === 'signin' && (
            <form onSubmit={submitPairCode}>
              <Stack gap="sm">
                <Text size="xs" c="dimmed">
                  Open the <b>JustBot Chrome Extension</b> (or desktop Settings → Account &amp; session) and click <b>Mobile Login QR Code</b>. Scan the QR code with your phone camera, or enter the 6-digit code below:
                </Text>
                <TextInput
                  label="6-Digit Pairing Code"
                  placeholder="123456"
                  maxLength={6}
                  value={pairCode}
                  onChange={(e) => setPairCode(e.currentTarget.value.replace(/\D/g, ''))}
                  required
                  inputMode="numeric"
                />
                <Button type="submit" loading={busy} disabled={pairCode.length !== 6}>
                  Log In This Device
                </Button>
              </Stack>
            </form>
          )}

          <Text size="xs" c="dimmed" ta="center">
            <Anchor component={Link} href="/privacy" size="xs">Privacy Policy &amp; Data Deletion</Anchor>
          </Text>
        </Stack>
      </Paper>
    </Center>
  );
}
