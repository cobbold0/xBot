'use client';
import Link from 'next/link';
import { Anchor, Badge, Button, Card, Container, Divider, Group, List, Stack, Text, Title } from '@mantine/core';

export default function PrivacyPage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Title order={2}>JustBot Privacy Policy &amp; Data Rights</Title>
            <Badge variant="light" color="indigo">Effective Oct 2026</Badge>
          </Group>
          <Button component={Link} href="/" variant="default" size="compact-md">Back to Dashboard</Button>
        </Group>

        <Card withBorder padding="lg">
          <Stack gap="md">
            <Title order={4}>1. What Data JustBot Collects &amp; Stores</Title>
            <List size="sm" spacing="xs">
              <List.Item><b>X Session Cookies (<code>auth_token</code>, <code>ct0</code>, <code>twid</code>):</b> Provided voluntarily by you via the JustBot dashboard or the JustBot Chrome Extension to authenticate actions on your X account without storing your X password.</List.Item>
              <List.Item><b>Configured Preferences:</b> Topics, search keywords, targeted public handles, voice instructions, rate limits, and budget caps.</List.Item>
              <List.Item><b>Scraped Public Content &amp; Drafts:</b> Publicly available posts from X, Google News, and Reddit matching your topics, along with AI-generated post/reply drafts and action logs.</List.Item>
            </List>

            <Divider />

            <Title order={4}>2. How Your Credentials &amp; Data Are Protected</Title>
            <List size="sm" spacing="xs">
              <List.Item><b>Zero Password Access:</b> JustBot never asks for, sees, or stores your X password or two-factor authentication codes.</List.Item>
              <List.Item><b>AES-256-GCM Encryption at Rest:</b> Your X session cookies are encrypted using <code>AES-256-GCM</code> (keyed with <code>SESSION_SECRET</code>) before being stored in the database and are never returned to the browser or written to logs.</List.Item>
              <List.Item><b>Automatic Log Redaction:</b> All system and error logs automatically strip cookie tokens, API keys, and session secrets.</List.Item>
            </List>

            <Divider />

            <Title order={4}>3. How We Use Your Data &amp; Third-Party Services</Title>
            <Text size="sm">
              Scraped public posts and your configured topics/voice are sent to the configured AI provider (Google Gemini API) strictly to score relevance and generate post/reply drafts. We never sell, rent, or share your personal data or session credentials with any third party.
            </Text>

            <Divider />

            <Title order={4}>4. Platform Risk &amp; Terms Disclosure</Title>
            <Text size="sm" c="dimmed">
              Automating an X account using session cookies is not endorsed by X Corp. and may violate X&apos;s Terms of Service, which could result in rate limits or account restrictions. By connecting your session, you acknowledge this risk and retain full control over dry-run mode, daily caps, and draft approvals.
            </Text>

            <Divider />

            <Title order={4}>5. Your Right to Delete Your Data (1-Click Purge)</Title>
            <Text size="sm">
              You can permanently delete your encrypted X cookies or wipe your entire dataset at any time:
            </Text>
            <List size="sm" spacing="xs">
              <List.Item><b>Disconnect X Session Only:</b> Open <Anchor component={Link} href="/settings">Settings → Account &amp; session</Anchor> and click <b>Remove saved</b>.</List.Item>
              <List.Item><b>Delete All Data &amp; Account History:</b> Open <Anchor component={Link} href="/settings">Settings → Privacy &amp; data</Anchor> and click <b>Delete all my data &amp; disconnect</b>. This immediately purges all encrypted credentials, settings, scraped posts, drafts, AI usage logs, and push subscriptions from the database.</List.Item>
            </List>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
