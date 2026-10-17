'use client';
import { useState } from 'react';
import { Badge, Box, Button, Card, Group, Paper, SegmentedControl, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconExternalLink, IconHeart, IconMessageCircle, IconPencil, IconRepeat } from '@tabler/icons-react';
import { useDash } from '@/components/dash';
import { Empty, PageTitle } from '@/components/ui';
import { FeedbackWidget } from '@/components/feedback';
import { api, fmtTime, relTime } from '@/web/client';

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
  const { data, act } = useDash();
  const [tab, setTab] = useState('actions');
  return (
    <Stack gap="md">
      <PageTitle>Activity</PageTitle>
      <SegmentedControl fullWidth value={tab} onChange={setTab} data={[
        { value: 'actions', label: 'Actions' },
        { value: 'jobs', label: 'Jobs' },
        { value: 'errors', label: `Errors${data.errors.length ? ` ${data.errors.length}` : ''}` },
      ]} />

      {tab === 'actions' && (data.actions.length === 0 ? (
        <Empty>No actions recorded yet. Every attempt (including dry-runs and blocked ones) appears here.</Empty>
      ) : (
        data.actions.map((x: any) => {
          const Icon = ICON[x.type as keyof typeof ICON] ?? IconPencil;
          const targetUrl = x.target_x_id ? `https://x.com/${x.target_author_handle || 'i'}/status/${x.target_x_id}` : null;
          const resultUrl = x.result_x_id ? `https://x.com/i/status/${x.result_x_id}` : null;

          return (
            <Card key={x.id} withBorder padding="sm">
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Group gap="xs" wrap="nowrap">
                    <ThemeIcon variant="light" color={COLOR[x.status]} size="md">
                      <Icon size={16} />
                    </ThemeIcon>
                    <Text fw={600} size="sm" tt="capitalize">
                      {x.type === 'like' ? 'Liked post' : x.type === 'repost' ? 'Reposted' : x.type === 'reply' ? 'Replied to post' : 'Published post'}
                    </Text>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    <Badge size="xs" variant="light" color={COLOR[x.status]}>
                      {x.status.replace('_', ' ')}
                    </Badge>
                    <Text size="xs" c="dimmed" title={fmtTime(x.created_at)}>
                      {relTime(x.created_at)}
                    </Text>
                  </Group>
                </Group>

                {/* Target Tweet Context (for likes, reposts, replies) */}
                {(x.type === 'like' || x.type === 'repost' || x.type === 'reply') && (x.target_text || x.target_author_handle || x.target_x_id) && (
                  <Paper withBorder p="xs" bg="var(--mantine-color-gray-0)" style={{ borderRadius: 6 }}>
                    <Stack gap={4}>
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="xs" fw={600} c="dimmed">
                          {x.target_author_handle ? `@${x.target_author_handle}` : 'Target post'}
                        </Text>
                        {targetUrl && (
                          <Text size="xs" component="a" href={targetUrl} target="_blank" rel="noreferrer" c="indigo" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            View on X <IconExternalLink size={12} />
                          </Text>
                        )}
                      </Group>
                      {x.target_text && (
                        <Text size="xs" lineClamp={3} style={{ whiteSpace: 'pre-wrap' }}>
                          {x.target_text}
                        </Text>
                      )}
                    </Stack>
                  </Paper>
                )}

                {/* Generated Text / Reply / Post Details */}
                {(x.type === 'reply' || x.type === 'post') && (x.draft_text || x.detail) && (
                  <Box pl="xs" style={{ borderLeft: '2px solid var(--mantine-color-indigo-4)' }}>
                    <Text size="xs" fw={600} c="indigo">
                      {x.type === 'reply' ? 'Our Reply:' : 'Post content:'}
                    </Text>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {x.draft_text || x.detail}
                    </Text>
                    {resultUrl && (
                      <Text size="xs" component="a" href={resultUrl} target="_blank" rel="noreferrer" c="indigo" mt={4} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        View live tweet on X <IconExternalLink size={12} />
                      </Text>
                    )}
                  </Box>
                )}

                {/* Dry run / failure / detail note if text isn't shown above */}
                {x.detail && x.type !== 'reply' && x.type !== 'post' && (
                  <Text size="xs" c="dimmed">{x.detail}</Text>
                )}

                {/* Feedback rating loop */}
                <Group justify="space-between" wrap="wrap" gap="xs" mt={4} pt={4} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                  <Text size="xs" c="dimmed">Rate this bot action:</Text>
                  <FeedbackWidget
                    targetType="action"
                    targetId={x.id}
                    initialRating={x.feedback_rating}
                    initialNote={x.feedback_note}
                    size="xs"
                  />
                </Group>
              </Stack>
            </Card>
          );
        })
      ))}

      {tab === 'jobs' && data.jobs.map((j) => (
        <Card key={j.name} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap"><Text fw={600}>{j.name}</Text><Badge variant="light" color={j.last_status === 'error' ? 'red' : j.last_status === 'ok' ? 'teal' : 'gray'}>{j.last_status ?? 'pending'}</Badge></Group>
          <Text size="xs" c="dimmed">Last finished {relTime(j.last_finished_at)} · next {relTime(j.next_run_at)}</Text>
          {j.last_error && <Text size="xs" c="red" mt={4} style={{ wordBreak: 'break-word' }}>{j.last_error}</Text>}
          <Button size="compact-sm" variant="light" mt="xs" onClick={() => act(api('/api/jobs', 'POST', { name: j.name }), `${j.name} will run within 15 seconds`)}>Run now</Button>
        </Card>
      ))}

      {tab === 'errors' && (data.errors.length === 0 ? <Empty>No errors recorded.</Empty> : groupErrors(data.errors).map((e) => (
        <Card key={e.id} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs"><Badge variant="outline" color="red">{e.source}</Badge>{e.count > 1 && <Badge size="xs" color="gray">{e.count}&times;</Badge>}</Group>
            <Text size="xs" c="dimmed">{relTime(e.created_at)}</Text>
          </Group>
          <Text size="sm" mt="xs" style={{ wordBreak: 'break-word', fontFamily: 'monospace' }}>{e.message}</Text>
        </Card>
      )))}
    </Stack>
  );
}
