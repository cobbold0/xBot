'use client';
import { useState } from 'react';
import { ActionIcon, Affix, Badge, Button, Card, Drawer, Group, Popover, RingProgress, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconCalendarTime, IconCheck, IconPlus, IconX } from '@tabler/icons-react';
import { useDash } from '@/components/dash';
import { Empty, PageTitle } from '@/components/ui';
import { api, fmtTime, type Dash } from '@/web/client';

type Draft = Dash['drafts'][number];
const GROUPS: Record<string, string[]> = { review: ['draft'], queue: ['approved', 'publishing'], published: ['published'], other: ['rejected', 'failed'] };
const COLOR: Record<string, string> = { draft: 'blue', approved: 'indigo', publishing: 'yellow', published: 'teal', rejected: 'gray', failed: 'red' };

export default function Drafts() {
  const { data, act } = useDash();
  const [tab, setTab] = useState('review');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const max = data.settings.maxPostChars;
  const counts = Object.fromEntries(Object.entries(GROUPS).map(([k, st]) => [k, data.drafts.filter((d) => st.includes(d.status)).length]));
  const list = data.drafts.filter((d) => GROUPS[tab].includes(d.status));

  return (
    <Stack gap="md">
      <PageTitle>Drafts</PageTitle>
      <SegmentedControl fullWidth value={tab} onChange={setTab} data={Object.keys(GROUPS).map((k) => ({ value: k, label: `${k[0].toUpperCase()}${k.slice(1)}${counts[k] ? ` ${counts[k]}` : ''}` }))} />
      {!data.settings.autoPublish && tab === 'queue' && <Text size="sm" c="yellow.7">Auto-publish is off — queued drafts will not be sent.</Text>}
      {list.length === 0 && <Empty>{tab === 'review' ? 'Nothing to review. Add topics in Settings so the generator can write drafts, or tap + to write one.' : 'Nothing here yet.'}</Empty>}
      {list.map((d) => <DraftCard key={`${d.id}:${d.text}`} d={d} max={max} />)}

      <Affix position={{ bottom: 'calc(80px + env(safe-area-inset-bottom))', right: 16 }} zIndex={150}>
        <ActionIcon size={52} radius="xl" aria-label="New draft" onClick={() => setOpen(true)}><IconPlus size={26} /></ActionIcon>
      </Affix>
      <Drawer opened={open} onClose={() => setOpen(false)} position="bottom" size="auto" title="New draft" padding="md">
        <Stack>
          <Textarea autosize minRows={4} maxRows={10} placeholder="What's happening?" value={text} onChange={(e) => setText(e.currentTarget.value)} data-autofocus />
          <Group justify="space-between">
            <Counter len={text.length} max={max} />
            <Button disabled={!text.trim() || text.length > max} onClick={async () => { if (await act(api('/api/drafts', 'POST', { action: 'create', text }), 'Draft added')) { setText(''); setOpen(false); } }}>Add draft</Button>
          </Group>
        </Stack>
      </Drawer>
    </Stack>
  );
}

function Counter({ len, max }: { len: number; max: number }) {
  const pct = Math.min(100, (len / max) * 100);
  return (
    <Group gap={6} wrap="nowrap">
      <RingProgress size={28} thickness={4} sections={[{ value: pct, color: len > max ? 'red' : pct > 90 ? 'yellow' : 'indigo' }]} />
      <Text size="xs" c={len > max ? 'red' : 'dimmed'}>{len}/{max}</Text>
    </Group>
  );
}

function DraftCard({ d, max }: { d: Draft; max: number }) {
  const { act } = useDash();
  const [text, setText] = useState(d.text);
  const [when, setWhen] = useState<Date | null>(null);
  const editable = d.status === 'draft' || d.status === 'approved';
  const post = (body: object, ok?: string) => act(api('/api/drafts', 'POST', { id: d.id, ...body }), ok);
  return (
    <Card withBorder padding="sm">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap={6}><Badge variant="light" color={COLOR[d.status]}>{d.status}</Badge><Badge variant="outline" color="gray">{d.kind}</Badge></Group>
          <Text size="xs" c="dimmed">{d.scheduled_for ? `Scheduled ${fmtTime(d.scheduled_for)}` : fmtTime(d.created_at)}</Text>
        </Group>
        {editable
          ? <Textarea autosize minRows={2} maxRows={8} value={text} onChange={(e) => setText(e.currentTarget.value)} />
          : <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{d.text}</Text>}
        {d.kind === 'reply' && d.reply_to_x_id && <Text size="xs" c="dimmed">Replying to <a href={`https://x.com/i/web/status/${d.reply_to_x_id}`} target="_blank" rel="noreferrer">this post</a></Text>}
        {d.rationale && <Text size="xs" c="dimmed">Why: {d.rationale}</Text>}
        {d.error && <Text size="xs" c="red">{d.error}</Text>}
        {d.x_id && <Text size="xs"><a href={`https://x.com/i/web/status/${d.x_id}`} target="_blank" rel="noreferrer">View on X</a></Text>}
        <Group justify="space-between" wrap="nowrap">
          {editable ? <Counter len={text.length} max={max} /> : <span />}
          <Group gap="xs" wrap="nowrap">
            {editable && text !== d.text && <Button size="compact-md" variant="default" disabled={!text.trim() || text.length > max} onClick={() => post({ action: 'edit', text }, 'Saved')}>Save</Button>}
            {d.status === 'draft' && (
              <>
                <Popover position="top-end" withArrow shadow="md">
                  <Popover.Target><ActionIcon variant="default" size="lg" aria-label="Schedule"><IconCalendarTime size={18} /></ActionIcon></Popover.Target>
                  <Popover.Dropdown>
                    <Stack gap="xs">
                      <DateTimePicker label="Publish at" value={when} onChange={(v) => setWhen(v ? new Date(v) : null)} minDate={new Date()} popoverProps={{ withinPortal: false }} />
                      <Button size="xs" disabled={!when || text !== d.text} onClick={() => post({ action: 'approve', scheduledFor: when!.toISOString() }, 'Scheduled')}>Approve &amp; schedule</Button>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
                <Button size="compact-md" leftSection={<IconCheck size={16} />} disabled={text !== d.text || text.length > max} onClick={() => post({ action: 'approve' }, 'Approved')}>Approve</Button>
              </>
            )}
            {editable && <ActionIcon variant="light" color="red" size="lg" aria-label="Reject" onClick={() => post({ action: 'reject' }, 'Rejected')}><IconX size={18} /></ActionIcon>}
            {d.status === 'failed' && <Button size="compact-md" variant="default" onClick={() => post({ action: 'retry' }, 'Moved back to drafts')}>Back to drafts</Button>}
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}
