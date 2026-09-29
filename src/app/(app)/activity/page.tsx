'use client';
import { useState } from 'react';
import { Badge, Card, Group, SegmentedControl, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconHeart, IconMessageCircle, IconPencil, IconRepeat } from '@tabler/icons-react';
import { useDash } from '@/components/dash';
import { Empty, PageTitle } from '@/components/ui';
import { fmtTime, relTime } from '@/web/client';

/** Collapses identical source+message errors (newest first) into one row with a count. */
function groupErrors<T extends { id: number; source: string; message: string; created_at: string }>(rows: T[]) {
  const map = new Map<string, T & { count: number }>();
  for (const r of rows) {
    const k = `${r.source}\u0000${r.message}`;
    const g = map.get(k);
    if (g) g.count++; else map.set(k, { ...r, count: 1 });
  }
  return [...map.values()];
}

const ICON = { post: IconPencil, reply: IconMessageCircle, like: IconHeart, repost: IconRepeat } as const;
const COLOR: Record<string, string> = { succeeded: 'teal', failed: 'red', dry_run: 'yellow', blocked: 'gray', attempted: 'blue' };

export default function Activity() {
  const { data } = useDash();
  const [tab, setTab] = useState('actions');
  return (
    <Stack gap="md">
      <PageTitle>Activity</PageTitle>
      <SegmentedControl fullWidth value={tab} onChange={setTab} data={[
        { value: 'actions', label: 'Actions' },
        { value: 'jobs', label: 'Jobs' },
        { value: 'errors', label: `Errors${data.errors.length ? ` ${data.errors.length}` : ''}` },
      ]} />

      {tab === 'actions' && (data.actions.length === 0 ? <Empty>No actions recorded yet. Every attempt (including dry-runs and blocked ones) appears here.</Empty> : data.actions.map((x) => {
        const Icon = ICON[x.type as keyof typeof ICON] ?? IconPencil;
        const xid = x.result_x_id ?? x.target_x_id;
        return (
          <Card key={x.id} withBorder padding="sm">
            <Group wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" color={COLOR[x.status]} size="lg"><Icon size={18} /></ThemeIcon>
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group justify="space-between" wrap="nowrap"><Text fw={600} size="sm" tt="capitalize">{x.type}</Text><Badge size="sm" variant="light" color={COLOR[x.status]}>{x.status.replace('_', ' ')}</Badge></Group>
                {x.detail && <Text size="xs" c="dimmed" lineClamp={2}>{x.detail}</Text>}
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed" title={fmtTime(x.created_at)}>{relTime(x.created_at)}</Text>
                  {xid && <Text size="xs"><a href={`https://x.com/i/web/status/${xid}`} target="_blank" rel="noreferrer">View</a></Text>}
                </Group>
              </Stack>
            </Group>
          </Card>
        );
      }))}

      {tab === 'jobs' && data.jobs.map((j) => (
        <Card key={j.name} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap"><Text fw={600}>{j.name}</Text><Badge variant="light" color={j.last_status === 'error' ? 'red' : j.last_status === 'ok' ? 'teal' : 'gray'}>{j.last_status ?? 'pending'}</Badge></Group>
          <Text size="xs" c="dimmed">Last finished {relTime(j.last_finished_at)} · next {relTime(j.next_run_at)}</Text>
          {j.last_error && <Text size="xs" c="red" mt={4}>{j.last_error}</Text>}
        </Card>
      ))}

      {tab === 'errors' && (data.errors.length === 0 ? <Empty>No errors. 🎉</Empty> : groupErrors(data.errors).map((e) => (
        <Card key={e.id} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap"><Badge color="red" variant="light" style={{ textTransform: 'none' }}>{e.source}</Badge>{e.count > 1 && <Badge variant="outline" color="gray">×{e.count}</Badge>}</Group>
            <Text size="xs" c="dimmed">{relTime(e.created_at)}</Text>
          </Group>
          <Text size="sm" mt={6} style={{ wordBreak: 'break-word' }}>{e.message}</Text>
        </Card>
      )))}
    </Stack>
  );
}
