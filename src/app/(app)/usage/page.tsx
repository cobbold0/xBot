'use client';
import { Group, Paper, Progress, SimpleGrid, Stack, Text } from '@mantine/core';
import { AreaChart, DonutChart } from '@mantine/charts';
import { useDash } from '@/components/dash';
import { Empty, PageTitle, Section } from '@/components/ui';

const COLORS = ['indigo.6', 'grape.6', 'teal.6', 'orange.6', 'pink.6'];

function Budget({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  return (
    <Paper withBorder p="sm">
      <Group justify="space-between"><Text size="sm" c="dimmed">{label}</Text><Text size="sm" fw={600}>${used.toFixed(3)} / ${limit}</Text></Group>
      <Progress mt="xs" value={pct} color={pct >= 100 ? 'red' : pct > 80 ? 'yellow' : 'indigo'} />
      {pct >= 100 && <Text size="xs" c="red" mt={4}>Budget reached — AI jobs are stopped until it resets.</Text>}
    </Paper>
  );
}

export default function Usage() {
  const { data } = useDash();
  const { usage: u, settings: s, series } = data;
  return (
    <Stack gap="md">
      <PageTitle>Usage</PageTitle>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Budget label="Today" used={u.dayUsd} limit={s.dailyBudgetUsd} />
        <Budget label="This month" used={u.monthUsd} limit={s.monthlyBudgetUsd} />
      </SimpleGrid>
      <SimpleGrid cols={2} spacing="sm">
        <Paper withBorder p="sm"><Text size="xs" c="dimmed">Input tokens (month)</Text><Text fw={700} size="lg">{u.monthInputTokens.toLocaleString()}</Text></Paper>
        <Paper withBorder p="sm"><Text size="xs" c="dimmed">Output tokens (month)</Text><Text fw={700} size="lg">{u.monthOutputTokens.toLocaleString()}</Text></Paper>
      </SimpleGrid>
      <Section title="Daily cost · 14 days">
        {series.cost.length ? <AreaChart h={200} data={series.cost} dataKey="d" series={[{ name: 'cost', color: 'indigo.6', label: 'USD' }]} curveType="monotone" valueFormatter={(v) => `$${v.toFixed(3)}`} /> : <Empty>No AI usage yet.</Empty>}
      </Section>
      <Section title="Cost by task · this month">
        {series.byPurpose.length
          ? <Group justify="center"><DonutChart size={160} thickness={26} data={series.byPurpose.map((p, i) => ({ name: p.name, value: Number(p.value.toFixed(5)), color: COLORS[i % COLORS.length] }))} valueFormatter={(v) => `$${v.toFixed(3)}`} withLabelsLine={false} /></Group>
          : <Empty>Nothing yet.</Empty>}
      </Section>
      <Text size="xs" c="dimmed">Costs are estimates: tokens × the ANTHROPIC_PRICE_* values in your environment, not billed amounts.</Text>
    </Stack>
  );
}
