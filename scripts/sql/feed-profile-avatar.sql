-- Apply once after checking the target and information_schema.COLUMNS / TABLE_CONSTRAINTS.
-- Existing opt-outs stay private; no use_account_avatar backfill is performed.
ALTER TABLE feed_profile
  ADD COLUMN custom_avatar_key VARCHAR(1024) NULL,
  ADD CONSTRAINT ck_feed_profile_avatar_source
    CHECK (custom_avatar_key IS NULL OR (use_account_avatar = FALSE AND CHAR_LENGTH(custom_avatar_key) > 0));
