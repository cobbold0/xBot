'use client';
import type { ReactNode } from 'react';
import { Card, Group, Paper, Text, Title } from '@mantine/core';

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <Group justify="space-between" wrap="nowrap"><Title order={3}>{children}</Title>{right}</Group>;
}
export function Section({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Card withBorder padding="md">
      {title && <Group justify="space-between" mb="sm"><Text fw={600}>{title}</Text>{right}</Group>}
      {children}
    </Card>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <Paper p="lg" withBorder style={{ borderStyle: 'dashed' }}><Text c="dimmed" size="sm" ta="center">{children}</Text></Paper>;
}
