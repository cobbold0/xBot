-- Migration 006: Add feedback table for human ratings and learning loop

CREATE TABLE IF NOT EXISTS feedback (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL DEFAULT 'default',
  target_type text NOT NULL CHECK (target_type IN ('action', 'draft')),
  target_id bigint NOT NULL,
  rating int NOT NULL CHECK (rating >= -1 AND rating <= 5),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feedback_user_target_idx ON feedback(user_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS feedback_user_time_idx ON feedback(user_id, created_at DESC);
