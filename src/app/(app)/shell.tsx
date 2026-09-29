'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ActionIcon, AppShell, Badge, Box, Button, Group, Indicator, NavLink, Stack, Text, UnstyledButton } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconActivity, IconChartAreaLine, IconHome2, IconPencil, IconPlayerPause, IconPlayerPlay, IconSettings, IconWifiOff } from '@tabler/icons-react';
import { api, type Dash } from '@/web/client';
import { DashProvider, useDash } from '@/components/dash';

const NAV = [
  { href: '/', label: 'Home', icon: IconHome2 },
  { href: '/drafts', label: 'Drafts', icon: IconPencil },
  { href: '/activity', label: 'Activity', icon: IconActivity },
  { href: '/usage', label: 'Usage', icon: IconChartAreaLine },
  { href: '/settings', label: 'Settings', icon: IconSettings },
];
const DOCK_H = 'calc(64px + env(safe-area-inset-bottom))';

export function Shell({ initial, children }: { initial: Dash; children: ReactNode }) {
  return <DashProvider initial={initial}><Frame>{children}</Frame></DashProvider>;
}

function useNav() {
  const path = usePathname();
  const { data } = useDash();
  const review = data.drafts.filter((d) => d.status === 'draft').length;
  return NAV.map((n) => ({ ...n, active: n.href === '/' ? path === '/' : path.startsWith(n.href), badge: n.href === '/drafts' ? review : 0 }));
}

function Frame({ children }: { children: ReactNode }) {
  const { data, act, offline } = useDash();
  const nav = useNav();
  const { control: c, account: a } = data;

  const stop = () => modals.openConfirmModal({
    title: 'Emergency stop', children: <Text size="sm">Halts all jobs and blocks every write action immediately. You must clear it manually.</Text>,
    labels: { confirm: 'Stop everything', cancel: 'Cancel' }, confirmProps: { color: 'red' },
    onConfirm: () => act(api('/api/control', 'POST', { emergencyStop: true }), 'Emergency stop active'),
  });

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: true } }} footer={{ height: DOCK_H }} padding="md" styles={{ footer: { display: undefined } }}>
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Text fw={800} size="lg">xBot</Text>
            <Badge variant="light" color={a.status === 'connected' ? 'teal' : 'red'} size="sm" style={{ textTransform: 'none' }}>{a.status === 'connected' && a.username ? `@${a.username}` : a.status}</Badge>
            {offline && <IconWifiOff size={16} color="var(--mantine-color-red-6)" aria-label="offline" />}
          </Group>
          <Group gap="xs" wrap="nowrap">
            {!c.emergencyStop && (
              <ActionIcon variant="light" size="lg" aria-label={c.paused ? 'Resume' : 'Pause'} color={c.paused ? 'yellow' : 'gray'} onClick={() => act(api('/api/control', 'POST', { paused: !c.paused }), c.paused ? 'Resumed' : 'Paused')}>
                {c.paused ? <IconPlayerPlay size={18} /> : <IconPlayerPause size={18} />}
              </ActionIcon>
            )}
            {c.emergencyStop
              ? <Button size="compact-md" color="red" variant="filled" onClick={() => act(api('/api/control', 'POST', { emergencyStop: false }), 'Emergency stop cleared')}>Clear stop</Button>
              : <Button size="compact-md" color="red" variant="light" onClick={stop}>Stop</Button>}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <Stack gap={4}>
          {nav.map((n) => <NavLink key={n.href} component={Link} href={n.href} active={n.active} label={n.label} leftSection={<n.icon size={18} />} rightSection={n.badge ? <Badge size="sm" circle>{n.badge}</Badge> : null} />)}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main pb={{ base: `calc(${DOCK_H} + var(--mantine-spacing-md))`, sm: 'md' }} maw={1100} mx="auto" w="100%">{children}</AppShell.Main>

      <AppShell.Footer hiddenFrom="sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} withBorder>
        <Group h={64} grow gap={0} wrap="nowrap" role="navigation" aria-label="Main">
          {nav.map((n) => (
            <UnstyledButton key={n.href} component={Link} href={n.href} aria-current={n.active ? 'page' : undefined} h="100%" c={n.active ? 'indigo' : 'dimmed'}>
              <Stack gap={2} align="center" justify="center" h="100%">
                <Indicator label={n.badge} disabled={!n.badge} size={16} offset={2}><n.icon size={24} stroke={n.active ? 2.2 : 1.6} /></Indicator>
                <Text size="xs" fw={n.active ? 700 : 500}>{n.label}</Text>
              </Stack>
            </UnstyledButton>
          ))}
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
