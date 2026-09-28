CREATE TABLE settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  paused boolean NOT NULL DEFAULT false,
  emergency_stop boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO control DEFAULT VALUES;

CREATE TABLE account (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown','connected','expired','error')),
  username text,
  checked_at timestamptz,
  detail text
);
INSERT INTO account DEFAULT VALUES;

CREATE TABLE posts (
  id bigserial PRIMARY KEY,
  x_id text NOT NULL UNIQUE,
  author_id text,
  author_handle text,
  text text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  source text NOT NULL,
  analysis jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','analyzed','skipped','failed')),
  analysis_attempts int NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_status_idx ON posts(status, first_seen_at);

CREATE TABLE drafts (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('post','reply')),
  text text NOT NULL,
  text_hash text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','publishing','published','rejected','failed')),
  scheduled_for timestamptz,
  reply_to_x_id text,
  x_id text,
  topic text,
  rationale text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drafts_status_idx ON drafts(status, scheduled_for);
CREATE INDEX drafts_hash_idx ON drafts(text_hash);

CREATE TABLE actions (
  id bigserial PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('post','like','repost','reply')),
  target_x_id text,
  draft_id bigint REFERENCES drafts(id),
  status text NOT NULL CHECK (status IN ('attempted','succeeded','failed','dry_run','blocked')),
  detail text,
  result_x_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX actions_type_time_idx ON actions(type, created_at);
CREATE UNIQUE INDEX actions_once_idx ON actions(type, target_x_id) WHERE status IN ('attempted','succeeded') AND type IN ('like','repost');

CREATE TABLE ai_usage (
  id bigserial PRIMARY KEY,
  purpose text NOT NULL,
  model text NOT NULL,
  input_tokens int NOT NULL,
  output_tokens int NOT NULL,
  cost_usd numeric(12,6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_time_idx ON ai_usage(created_at);

CREATE TABLE errors (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  name text PRIMARY KEY,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  locked_by text,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text,
  last_error text
);
