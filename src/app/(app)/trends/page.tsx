'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Modal,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
} from '@mantine/core';
import {
  IconArrowRight,
  IconBrandReddit,
  IconBrandX,
  IconExternalLink,
  IconFlame,
  IconHeart,
  IconMessageCircle,
  IconNews,
  IconRefresh,
  IconRepeat,
  IconSearch,
  IconSparkles,
} from '@tabler/icons-react';
import { useDash } from '@/components/dash';
import { Empty, PageTitle } from '@/components/ui';
import { api, fmtTime, relTime } from '@/web/client';

interface TrendingPost {
  id: number;
  x_id: string;
  author_handle: string | null;
  text: string;
  source: string;
  metadata: {
    likes?: number;
    reposts?: number;
    replies?: number;
    views?: number;
    url?: string;
    createdAt?: string;
  } | null;
  analysis: {
    topic?: string;
    relevance?: number;
    quality?: number;
  } | null;
  status: string;
  first_seen_at: string;
  trending_score: number;
  has_draft: boolean;
}

export default function TrendsPage() {
  const { act } = useDash();
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string>('all');
  const [timeframe, setTimeframe] = useState<string>('30d');
  const [search, setSearch] = useState<string>('');
  const [selectedPost, setSelectedPost] = useState<TrendingPost | null>(null);
  const [customTake, setCustomTake] = useState<string>('');
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const loadTrends = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (platform !== 'all') q.set('platform', platform);
      if (timeframe) q.set('timeframe', timeframe);
      if (search.trim()) q.set('search', search.trim());

      const res = await api<{ ok: boolean; posts: TrendingPost[] }>(`/api/trends?${q.toString()}`, 'GET');
      if (res?.posts) {
        setPosts(res.posts);
      }
    } catch {
      // handled by api toast
    } finally {
      setLoading(false);
    }
  }, [platform, timeframe, search]);

  useEffect(() => {
    loadTrends();
  }, [loadTrends]);

  const handleFastForward = async (post: TrendingPost, instruction?: string) => {
    setGeneratingId(post.id);
    try {
      const res = await act(
        api('/api/trends/fast-forward', 'POST', {
          postId: post.id,
          customInstruction: instruction?.trim() || undefined,
        }),
        'Draft synthesized and ready in Drafts!',
      );
      if (res?.ok) {
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, has_draft: true } : p)),
        );
        setSelectedPost(null);
        setCustomTake('');
      }
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" align="center">
        <div>
          <PageTitle>Trending Intelligence</PageTitle>
          <Text size="xs" c="dimmed">
            Scraped news and conversations across X, Google News, and Reddit ranked by 30-day velocity.
          </Text>
        </div>
        <ActionIcon variant="light" size="lg" aria-label="Refresh trends" onClick={loadTrends}>
          <IconRefresh size={18} />
        </ActionIcon>
      </Group>

      {/* Filter bar */}
      <Card withBorder padding="xs">
        <Grid gap="xs" align="center">
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <SegmentedControl
              fullWidth
              size="xs"
              value={platform}
              onChange={setPlatform}
              data={[
                { value: 'all', label: 'All Sources' },
                { value: 'x', label: 'X (Twitter)' },
                { value: 'gnews', label: 'Google News' },
                { value: 'reddit', label: 'Reddit' },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Select
              size="xs"
              value={timeframe}
              onChange={(val) => val && setTimeframe(val)}
              data={[
                { value: '24h', label: 'Past 24 Hours' },
                { value: '7d', label: 'Past 7 Days' },
                { value: '30d', label: 'Past 30 Days' },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <TextInput
              size="xs"
              placeholder="Search keyword or handle..."
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadTrends();
              }}
            />
          </Grid.Col>
        </Grid>
      </Card>

      {/* Content list */}
      {loading ? (
        <Group justify="center" py="xl">
          <Loader size="md" />
        </Group>
      ) : posts.length === 0 ? (
        <Empty>No scraped trending content matches your filters. Scraped posts appear as the bot scans X, Google News, and Reddit.</Empty>
      ) : (
        <Stack gap="sm">
          {posts.map((post) => {
            const isX = !post.source.startsWith('gnews:') && !post.source.startsWith('reddit:');
            const isGNews = post.source.startsWith('gnews:');
            const isReddit = post.source.startsWith('reddit:');

            const sourceUrl =
              post.metadata?.url ||
              (isX && post.x_id
                ? `https://x.com/${post.author_handle || 'i'}/status/${post.x_id}`
                : isReddit && post.x_id
                ? `https://reddit.com${post.x_id}`
                : null);

            return (
              <Card key={post.id} withBorder padding="sm">
                <Stack gap="xs">
                  {/* Card Header: Source & Metrics */}
                  <Group justify="space-between" wrap="wrap" gap="xs">
                    <Group gap="xs" wrap="nowrap">
                      {isX ? (
                        <ThemeIcon size="sm" variant="light" color="blue">
                          <IconBrandX size={14} />
                        </ThemeIcon>
                      ) : isGNews ? (
                        <ThemeIcon size="sm" variant="light" color="teal">
                          <IconNews size={14} />
                        </ThemeIcon>
                      ) : (
                        <ThemeIcon size="sm" variant="light" color="orange">
                          <IconBrandReddit size={14} />
                        </ThemeIcon>
                      )}

                      <Text size="xs" fw={700}>
                        {isX
                          ? `@${post.author_handle || 'anonymous'}`
                          : isGNews
                          ? post.author_handle || 'News Article'
                          : `r/${post.author_handle || 'reddit'}`}
                      </Text>

                      {post.analysis?.topic && (
                        <Badge size="xs" variant="outline" color="gray">
                          {post.analysis.topic}
                        </Badge>
                      )}
                    </Group>

                    <Group gap="xs" wrap="nowrap">
                      <Badge size="xs" variant="light" color="red" leftSection={<IconFlame size={12} />}>
                        Score {post.trending_score}
                      </Badge>
                      <Text size="xs" c="dimmed" title={fmtTime(post.first_seen_at)}>
                        {relTime(post.first_seen_at)}
                      </Text>
                    </Group>
                  </Group>

                  {/* Body Text */}
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {post.text}
                  </Text>

                  {/* Stats Badges */}
                  <Group gap="md" wrap="wrap" align="center">
                    {post.metadata?.likes !== undefined && post.metadata.likes > 0 && (
                      <Group gap={4} wrap="nowrap">
                        <IconHeart size={14} color="var(--mantine-color-dimmed)" />
                        <Text size="xs" c="dimmed">{post.metadata.likes.toLocaleString()}</Text>
                      </Group>
                    )}
                    {post.metadata?.reposts !== undefined && post.metadata.reposts > 0 && (
                      <Group gap={4} wrap="nowrap">
                        <IconRepeat size={14} color="var(--mantine-color-dimmed)" />
                        <Text size="xs" c="dimmed">{post.metadata.reposts.toLocaleString()}</Text>
                      </Group>
                    )}
                    {post.metadata?.replies !== undefined && post.metadata.replies > 0 && (
                      <Group gap={4} wrap="nowrap">
                        <IconMessageCircle size={14} color="var(--mantine-color-dimmed)" />
                        <Text size="xs" c="dimmed">{post.metadata.replies.toLocaleString()}</Text>
                      </Group>
                    )}
                  </Group>

                  {/* Action Footer */}
                  <Group justify="space-between" wrap="wrap" gap="xs" pt={4} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                    <div>
                      {sourceUrl && (
                        <Text
                          size="xs"
                          component="a"
                          href={sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          c="indigo"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          View original source <IconExternalLink size={12} />
                        </Text>
                      )}
                    </div>

                    <Group gap="xs" wrap="nowrap">
                      {post.has_draft ? (
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="teal"
                          component={Link}
                          href="/drafts"
                          rightSection={<IconArrowRight size={13} />}
                        >
                          View draft
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="compact-xs"
                            variant="default"
                            onClick={() => setSelectedPost(post)}
                          >
                            Custom angle...
                          </Button>
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="indigo"
                            loading={generatingId === post.id}
                            leftSection={<IconSparkles size={13} />}
                            onClick={() => handleFastForward(post)}
                          >
                            Fast-forward with AI
                          </Button>
                        </>
                      )}
                    </Group>
                  </Group>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Custom Take Modal */}
      <Modal
        opened={!!selectedPost}
        onClose={() => {
          setSelectedPost(null);
          setCustomTake('');
        }}
        title="Generate Post with Custom Angle"
        size="md"
      >
        {selectedPost && (
          <Stack gap="sm">
            <Text size="xs" c="dimmed" lineClamp={3}>
              Story: &ldquo;{selectedPost.text}&rdquo;
            </Text>
            <Textarea
              label="Your Angle / Instructions"
              description="Tell the AI what specific takeaway, opinion, or tone to emphasize"
              placeholder="e.g. Focus on how this affects indie hackers, or frame it as a cautionary tale"
              value={customTake}
              onChange={(e) => setCustomTake(e.currentTarget.value)}
              autosize
              minRows={3}
              maxRows={6}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setSelectedPost(null)}>
                Cancel
              </Button>
              <Button
                color="indigo"
                leftSection={<IconSparkles size={16} />}
                loading={generatingId === selectedPost.id}
                onClick={() => handleFastForward(selectedPost, customTake)}
              >
                Synthesize draft
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
