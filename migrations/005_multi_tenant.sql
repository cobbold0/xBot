-- Multi-tenant isolation: scope posts, drafts, actions, ai_usage, errors, push_subscriptions, account, and control per user_id.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'default';
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_x_id_key;
DROP INDEX IF EXISTS posts_user_x_id_idx;
CREATE UNIQUE INDEX posts_user_x_id_idx ON posts(user_id, x_id);
DROP INDEX IF EXISTS posts_user_status_idx;
CREATE INDEX posts_user_status_idx ON posts(user_id, status, first_seen_at);

ALTER TABLE drafts ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'default';
DROP INDEX IF EXISTS drafts_user_status_idx;
CREATE INDEX drafts_user_status_idx ON drafts(user_id, status, scheduled_for);

ALTER TABLE actions ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'default';
DROP INDEX IF EXISTS actions_once_idx;
CREATE UNIQUE INDEX actions_once_idx ON actions(user_id, type, target_x_id) WHERE status IN ('attempted','succeeded') AND type IN ('like','repost');
DROP INDEX IF EXISTS actions_user_type_time_idx;
CREATE INDEX actions_user_type_time_idx ON actions(user_id, type, created_at);

ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'default';
DROP INDEX IF EXISTS ai_usage_user_time_idx;
CREATE INDEX ai_usage_user_time_idx ON ai_usage(user_id, created_at);

ALTER TABLE errors ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'default';
DROP INDEX IF EXISTS errors_user_id_idx;
CREATE INDEX errors_user_id_idx ON errors(user_id, id DESC);

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'default';
DROP INDEX IF EXISTS push_subscriptions_user_idx;
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);

-- Convert account and control from single-row boolean PK to per-user PK while preserving default row
ALTER TABLE account DROP CONSTRAINT IF EXISTS account_pkey;
ALTER TABLE account DROP CONSTRAINT IF EXISTS account_id_check;
ALTER TABLE account ALTER COLUMN id DROP DEFAULT;
ALTER TABLE account ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'default';
CREATE UNIQUE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id);

ALTER TABLE control DROP CONSTRAINT IF EXISTS control_pkey;
ALTER TABLE control DROP CONSTRAINT IF EXISTS control_id_check;
ALTER TABLE control ALTER COLUMN id DROP DEFAULT;
ALTER TABLE control ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'default';
CREATE UNIQUE INDEX IF NOT EXISTS control_user_id_idx ON control(user_id);

-- If exactly one user already exists in app_users, assign existing 'default' data to that user
DO $$
DECLARE
  first_uid text;
BEGIN
  SELECT id INTO first_uid FROM app_users ORDER BY created_at ASC LIMIT 1;
  IF first_uid IS NOT NULL THEN
    UPDATE posts SET user_id = first_uid WHERE user_id = 'default';
    UPDATE drafts SET user_id = first_uid WHERE user_id = 'default';
    UPDATE actions SET user_id = first_uid WHERE user_id = 'default';
    UPDATE ai_usage SET user_id = first_uid WHERE user_id = 'default';
    UPDATE errors SET user_id = first_uid WHERE user_id = 'default';
    UPDATE push_subscriptions SET user_id = first_uid WHERE user_id = 'default';

    INSERT INTO account(id, user_id, status, username, checked_at, detail)
    SELECT true, first_uid, status, username, checked_at, detail FROM account WHERE user_id = 'default'
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO control(id, user_id, paused, emergency_stop, updated_at)
    SELECT true, first_uid, paused, emergency_stop, updated_at FROM control WHERE user_id = 'default'
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO settings(key, value, updated_at)
    SELECT 'app:' || first_uid, value, updated_at FROM settings WHERE key = 'app'
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO settings(key, value, updated_at)
    SELECT 'x_credentials:' || first_uid, value, updated_at FROM settings WHERE key = 'x_credentials'
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
