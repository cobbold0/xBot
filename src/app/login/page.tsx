'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, Anchor, Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';

export default function Login() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr('');
    const password = new FormData(e.currentTarget).get('password');
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (r.ok) location.href = '/'; else { setErr(r.status === 429 ? 'Too many attempts. Try again later.' : 'Invalid password'); setBusy(false); }
  }
  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder p="lg" w="100%" maw={360} component="form" onSubmit={submit}>
        <Stack>
          <Title order={2}>JustBot</Title>
          <PasswordInput name="password" label="Password" autoFocus required autoComplete="current-password" />
          {err && <Alert color="red" p="xs">{err}</Alert>}
          <Button type="submit" loading={busy}>Sign in</Button>
          <Text size="xs" c="dimmed" ta="center">
            <Anchor component={Link} href="/privacy" size="xs">Privacy Policy &amp; Data Deletion</Anchor>
          </Text>
        </Stack>
      </Paper>
    </Center>
  );
}
