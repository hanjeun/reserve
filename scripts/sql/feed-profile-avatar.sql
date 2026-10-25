-- 대상과 메타데이터를 대조한 뒤 한 번만 적용한다.
-- 기존 비공개 선택을 유지하며 use_account_avatar를 일괄 보정하지 않는다.
ALTER TABLE feed_profile
  ADD COLUMN custom_avatar_key VARCHAR(1024) NULL,
  ADD CONSTRAINT ck_feed_profile_avatar_source
    CHECK (custom_avatar_key IS NULL OR (use_account_avatar = FALSE AND CHAR_LENGTH(custom_avatar_key) > 0));
