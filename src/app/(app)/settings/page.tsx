'use client';
import { useState } from 'react';
import { Accordion, Affix, Button, Group, NumberInput, Paper, SimpleGrid, Stack, Switch, TagsInput, Text, Textarea } from '@mantine/core';
import { useDash } from '@/components/dash';
import { PushSettings } from '@/components/push';
import { XCredentials } from '@/components/x-credentials';
import { PageTitle } from '@/components/ui';
import { api, type Dash } from '@/web/client';

type S = Dash['settings'];
const FLAGS: [keyof S, string, string][] = [
  ['dryRun', 'Dry-run', 'Never write to X. Every action is recorded as a dry run.'],
  ['autoPublish', 'Auto-publish', 'Send approved drafts (posts and approved replies) at their scheduled time; generated drafts are auto-approved.'],
  ['autoLike', 'Auto-like', 'Like posts the AI rates relevant and high quality.'],
  ['autoRepost', 'Auto-repost', 'Repost posts the AI rates relevant and high quality.'],
];
const NUMS: [keyof S, string, number, number, number?][] = [
  ['pollIntervalMin', 'Poll every (min)', 5, 1440], ['generateIntervalMin', 'Generate every (min)', 15, 10080],
  ['maxPostChars', 'Max post length', 20, 280], ['maxPostsProcessedPerRun', 'Posts analyzed per run', 1, 100],
  ['maxPostsPerDay', 'Posts / day', 0, 50], ['maxRepliesPerDay', 'Replies / day', 0, 50],
  ['maxLikesPerDay', 'Likes / day', 0, 200], ['maxRepostsPerDay', 'Reposts / day', 0, 50],
  ['minActionSpacingSec', 'Min seconds between actions', 5, 3600], ['minRelevance', 'Min relevance (1-10)', 1, 10],
  ['minQuality', 'Min quality (1-10)', 1, 10], ['similarityThreshold', 'Duplicate similarity (0.3-1)', 0.3, 1, 0.05],
  ['dailyBudgetUsd', 'Daily AI budget ($)', 0, 100000, 0.5], ['monthlyBudgetUsd', 'Monthly AI budget ($)', 0, 100000, 1],
];

export default function Settings() {
  const { data, act } = useDash();
  const [v, setV] = useState<S>(data.settings);
  const dirty = JSON.stringify(v) !== JSON.stringify(data.settings);
  const set = <K extends keyof S>(k: K, val: S[K]) => setV((p) => ({ ...p, [k]: val }));
  const save = async () => { const r = await act(api<S>('/api/settings', 'PUT', v), 'Settings saved'); if (r) setV(r); };

  return (
    <Stack gap="md" pb={dirty ? 72 : 0}>
      <PageTitle>Settings</PageTitle>
      <Accordion multiple variant="separated" defaultValue={data.account.status === 'connected' ? ['safety', 'sources'] : ['account']}>
        <Accordion.Item value="safety">
          <Accordion.Control>Safety &amp; automation</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              {FLAGS.map(([k, label, desc]) => <Switch key={k} label={label} description={desc} checked={v[k] as boolean} onChange={(e) => set(k, e.currentTarget.checked as never)} />)}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="sources">
          <Accordion.Control>Topics, sources &amp; voice</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <TagsInput label="Topics" description="What you post about. The generator needs at least one." value={v.topics} onChange={(x) => set('topics', x)} placeholder="Type and press Enter" />
              <TagsInput label="Search terms" description="Keywords to monitor on X." value={v.searchTerms} onChange={(x) => set('searchTerms', x)} placeholder="Type and press Enter" />
              <TagsInput label="Accounts" description="Handles to watch (without @)." value={v.accounts} onChange={(x) => set('accounts', x)} placeholder="Type and press Enter" />
              <Textarea label="Voice" description="How your posts should sound." autosize minRows={3} maxLength={2000} value={v.voice} onChange={(e) => set('voice', e.currentTarget.value)} />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="limits">
          <Accordion.Control>Schedule, limits &amp; budgets</Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              {NUMS.map(([k, label, min, max, step]) => (
                <NumberInput key={k} label={label} min={min} max={max} step={step ?? 1} decimalScale={step && step < 1 ? 2 : 0} value={v[k] as number} onChange={(x) => typeof x === 'number' && set(k, x as never)} inputMode="decimal" />
              ))}
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="notify">
          <Accordion.Control>Notifications</Accordion.Control>
          <Accordion.Panel><PushSettings /></Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="account">
          <Accordion.Control>Account &amp; session</Accordion.Control>
          <Accordion.Panel><XCredentials /></Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {dirty && (
        <Affix position={{ bottom: 'calc(76px + env(safe-area-inset-bottom))', left: 12, right: 12 }} zIndex={150}>
          <Paper withBorder shadow="md" p="xs" maw={520} mx="auto">
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" ml="xs">Unsaved changes</Text>
              <Group gap="xs" wrap="nowrap"><Button variant="default" size="compact-md" onClick={() => setV(data.settings)}>Reset</Button><Button size="compact-md" onClick={save}>Save</Button></Group>
            </Group>
          </Paper>
        </Affix>
      )}
    </Stack>
  );
}
