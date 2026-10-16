ALTER TABLE drafts ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'none' CHECK (media_type IN ('none','image','video'));
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS media_prompt text;
