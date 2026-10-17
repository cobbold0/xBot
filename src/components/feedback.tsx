'use client';
import { useState } from 'react';
import { ActionIcon, Button, Group, Popover, Rating, Stack, Text, Textarea } from '@mantine/core';
import { IconMessageCheck, IconNote } from '@tabler/icons-react';
import { api } from '@/web/client';
import { useDash } from '@/components/dash';

interface FeedbackProps {
  targetType: 'action' | 'draft';
  targetId: number;
  initialRating?: number | null;
  initialNote?: string | null;
  size?: 'xs' | 'sm' | 'md';
}

export function FeedbackWidget({ targetType, targetId, initialRating, initialNote, size = 'sm' }: FeedbackProps) {
  const { act } = useDash();
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [note, setNote] = useState<string>(initialNote ?? '');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const saveFeedback = async (newRating: number, noteText: string = note) => {
    setRating(newRating);
    setSubmitting(true);
    try {
      await act(
        api('/api/feedback', 'POST', {
          targetType,
          targetId,
          rating: newRating,
          note: noteText.trim() || undefined,
        }),
        'Rating saved! AI will learn from this.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <Rating
        value={rating > 0 ? rating : 0}
        onChange={(val) => saveFeedback(val)}
        size={size}
        color="yellow"
      />
      <Popover opened={popoverOpen} onChange={setPopoverOpen} position="top-end" withArrow shadow="md" width={260}>
        <Popover.Target>
          <ActionIcon
            variant={note ? 'filled' : 'subtle'}
            color={note ? 'indigo' : 'gray'}
            size={size === 'xs' ? 'sm' : 'md'}
            aria-label="Add feedback note"
            onClick={() => setPopoverOpen((o) => !o)}
          >
            {note ? <IconMessageCheck size={14} /> : <IconNote size={14} />}
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Text size="xs" fw={600}>Teach AI your preferences</Text>
            <Textarea
              placeholder="e.g. Loved this tone, or: don't use this phrase again"
              size="xs"
              autosize
              minRows={2}
              maxRows={4}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
            <Button
              size="compact-xs"
              loading={submitting}
              onClick={() => {
                saveFeedback(rating || 5, note);
                setPopoverOpen(false);
              }}
            >
              Save note
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>
      {rating > 0 && (
        <Text size="xs" c="dimmed">
          {rating >= 4 ? 'Loved' : rating === 3 ? 'Neutral' : 'Needs work'}
        </Text>
      )}
    </Group>
  );
}
