'use client';
import Link from 'next/link';
import { Alert, Anchor, Badge, Box, Group, Paper, Progress, RingProgress, SimpleGrid, Stack, Text } from '@mantine/core';
import { AreaChart, BarChart } from '@mantine/charts';
import { IconAlertTriangle, IconFlask, IconLock, IconPlayerPause, IconShieldOff } from '@tabler/icons-react';
import { useDash } from '@/components/dash';
import { Empty, PageTitle, Section } from '@/components/ui';
import { fmtTime, relTime } from '@/web/client';

export default function Home() {
  const { data } = useDash();
  const { control: c, settings: s, account: a, usage: u, today, posts, series } = data;
  const dayPct = s.dailyBudgetUsd > 0 ? Math.min(100, (u.dayUsd / s.dailyBudgetUsd) * 100) : 100;
  const review = data.drafts.filter((d) => d.status === 'draft');
  const caps = [['Posts', 'post', s.maxPostsPerDay], ['Replies', 'reply', s.maxRepliesPerDay], ['Likes', 'like', s.maxLikesPerDay], ['Reposts', 'repost', s.maxRepostsPerDay]] as const;

  return (
    <Stack gap="md">
      <PageTitle>Overview</PageTitle>
      <Stack gap="xs">
        {c.emergencyStop && <Alert color="red" icon={<IconShieldOff size={18} />} title="Emergency stop active">All jobs and write actions are halted.</Alert>}
        {c.paused && !c.emergencyStop && <Alert color="yellow" icon={<IconPlayerPause size={18} />} title="Paused">Jobs are skipped until you resume.</Alert>}
        {a.status !== 'connected' && <Alert color="red" icon={<IconAlertTriangle size={18} />} title={`X account: ${a.status}`}>{a.detail ?? 'Not connected yet.'} <Anchor component={Link} href="/settings" size="sm">Open settings</Anchor></Alert>}
        {s.dryRun && <Alert color="yellow" variant="light" icon={<IconFlask size={18} />} title="Dry-run">Nothing is written to X. Turn it off in Settings when ready.</Alert>}
        {!s.autoPublish && <Alert color="blue" variant="light" icon={<IconLock size={18} />} title="Publishing off">Approved drafts wait until auto-publish is enabled.</Alert>}
      </Stack>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <Paper withBorder p="sm">
          <Text size="xs" c="dimmed">Account</Text>
          <Badge color={a.status === 'connected' ? 'teal' : 'red'} mt={4} style={{ textTransform: 'none' }}>{a.status === 'connected' ? `@${a.username}` : a.status}</Badge>
          <Text size="xs" c="dimmed" mt={6}>Checked {relTime(a.checked_at)}</Text>
        </Paper>
        <Paper withBorder p="sm">
          <Text size="xs" c="dimmed">AI today</Text>
          <Group gap="xs" wrap="nowrap" mt={2}>
            <RingProgress size={56} thickness={6} sections={[{ value: dayPct, color: dayPct > 85 ? 'red' : 'indigo' }]} />
            <Stack gap={0}><Text fw={700}>${u.dayUsd.toFixed(3)}</Text><Text size="xs" c="dimmed">of ${s.dailyBudgetUsd}</Text></Stack>
          </Group>
        </Paper>
        <Paper withBorder p="sm">
          <Text size="xs" c="dimmed" mb={4}>Today’s actions</Text>
          <Stack gap={4}>
            {caps.map(([label, k, max]) => (
              <Box key={k}>
                <Group justify="space-between"><Text size="xs">{label}</Text><Text size="xs" c="dimmed">{today[k] ?? 0}/{max}</Text></Group>
                <Progress size="xs" value={max ? ((today[k] ?? 0) / max) * 100 : 0} />
              </Box>
            ))}
          </Stack>
        </Paper>
        <Paper withBorder p="sm">
          <Text size="xs" c="dimmed">Posts seen</Text>
          <Text fw={700} size="xl">{Object.values(posts).reduce((x, y) => x + y, 0)}</Text>
          <Text size="xs" c="dimmed">{posts.analyzed ?? 0} analyzed · {posts.new ?? 0} queued</Text>
        </Paper>
      </SimpleGrid>

      {review.length > 0 && (
        <Section title="Needs review" right={<Anchor component={Link} href="/drafts" size="sm">See all ({review.length})</Anchor>}>
          <Stack gap="xs">{review.slice(0, 3).map((d) => <Text key={d.id} size="sm" lineClamp={2}>{d.kind === 'reply' ? '↩ ' : ''}{d.text}</Text>)}</Stack>
        </Section>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <Section title="AI cost · 14 days">
          {series.cost.length
            ? <AreaChart h={170} data={series.cost} dataKey="d" series={[{ name: 'cost', color: 'indigo.6', label: 'USD' }]} curveType="monotone" withDots={false} valueFormatter={(v) => `$${v.toFixed(3)}`} />
            : <Empty>No AI usage yet.</Empty>}
        </Section>
        <Section title="Sent to X · 14 days">
          {series.actions.length
            ? <BarChart h={170} data={series.actions} dataKey="d" type="stacked" series={[{ name: 'post', color: 'indigo.6' }, { name: 'reply', color: 'grape.6' }, { name: 'like', color: 'pink.6' }, { name: 'repost', color: 'teal.6' }]} />
            : <Empty>Nothing sent to X yet.</Empty>}
        </Section>
      </SimpleGrid>

      <Section title="Scheduled jobs">
        <Stack gap={6}>
          {data.jobs.map((j) => (
            <Group key={j.name} justify="space-between" wrap="nowrap">
              <Text size="sm" fw={500}>{j.name}</Text>
              <Group gap="xs" wrap="nowrap">
                <Badge size="sm" variant="light" color={j.last_status === 'error' ? 'red' : j.last_status === 'ok' ? 'teal' : 'gray'}>{j.last_status ?? 'pending'}</Badge>
                <Text size="xs" c="dimmed" title={fmtTime(j.next_run_at)}>{relTime(j.next_run_at)}</Text>
              </Group>
            </Group>
          ))}
        </Stack>
      </Section>
    </Stack>
  );
}
