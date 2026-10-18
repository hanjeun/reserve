-- Selected first-v6 candidate for the verified MySQL 8.0.45 / reserve / pre-feed v2 schema.
-- Preparation only: production execution requires the approved candidate, fresh backup/restore,
-- compatible recovery inputs, and explicit production DDL approval from manual-ddl.md section 15.
-- Run in the mysql CLI WITHOUT --force. A failed preflight stops this script before DDL.
-- After any partial failure, compare metadata and prepare only the remaining statements.
-- Do not concatenate manual-ddl.md 15.1/15.5 or the three included SQL files again.

SET @reserve_v6_preflight_sql = IF(
    DATABASE() = 'reserve' AND VERSION() = '8.0.45'
    AND (SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('member','store','promotion')
           AND TABLE_TYPE = 'BASE TABLE' AND ENGINE = 'InnoDB') = 3
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_KEY = 'PRI' AND COLUMN_TYPE = 'bigint'
           AND ((TABLE_NAME = 'member' AND COLUMN_NAME = 'member_id')
             OR (TABLE_NAME = 'store' AND COLUMN_NAME = 'store_id')
             OR (TABLE_NAME = 'promotion' AND COLUMN_NAME = 'promotion_id'))) = 3
    AND (SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
           ('feed_profile','feed_post','feed_media','feed_report','feed_report_image','feed_audit_record',
            'content_like','feed_comment','feed_comment_report','feed_comment_report_image','feed_notification')) = 0
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion' AND COLUMN_NAME IN
           ('news_type','state','starts_at','ends_at','conditions','feed_enabled','benefit_state',
            'benefit_requested_at','benefit_reviewed_at','benefit_reviewer_id','benefit_review_note',
            'revision','deleted_at','benefit_design')) = 0
    AND (SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_report' AND TABLE_TYPE = 'BASE TABLE') = 1
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_report' AND COLUMN_NAME = 'revision') = 0,
    'SELECT ''V6_PREFLIGHT_OK'' AS result',
    NULL
);
PREPARE reserve_v6_preflight FROM @reserve_v6_preflight_sql;
EXECUTE reserve_v6_preflight;
DEALLOCATE PREPARE reserve_v6_preflight;

-- Section 15 includes the section 15.1 benefit columns and initial report revisions.


ALTER TABLE promotion
  ADD COLUMN news_type VARCHAR(16) NOT NULL DEFAULT 'NEWS',
  ADD COLUMN state VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN starts_at DATETIME(6),
  ADD COLUMN ends_at DATETIME(6),
  ADD COLUMN conditions VARCHAR(1000),
  ADD COLUMN feed_enabled BIT(1) NOT NULL DEFAULT b'0',
  ADD COLUMN benefit_state VARCHAR(16) NOT NULL DEFAULT 'NONE',
  ADD COLUMN benefit_requested_at DATETIME(6),
  ADD COLUMN benefit_reviewed_at DATETIME(6),
  ADD COLUMN benefit_reviewer_id BIGINT,
  ADD COLUMN benefit_review_note VARCHAR(1000),
  ADD COLUMN revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN deleted_at DATETIME(6),
  ADD INDEX ix_promotion_news_public (state,news_type,ends_at,created_at,promotion_id),
  ADD INDEX ix_promotion_news_author (member_id,state,created_at,promotion_id),
  ADD INDEX ix_promotion_news_deleted (state,deleted_at,promotion_id),
  ADD INDEX ix_promotion_benefit_review (benefit_state,benefit_requested_at,promotion_id);

CREATE TABLE feed_profile (
  profile_id BIGINT NOT NULL AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  public_id VARCHAR(36) NOT NULL,
  nickname VARCHAR(30) NOT NULL,
  nickname_key VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  bio VARCHAR(160),
  use_account_avatar BIT(1) NOT NULL,
  hidden BIT(1) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (profile_id),
  CONSTRAINT uk_feed_profile_member UNIQUE (member_id),
  CONSTRAINT uk_feed_profile_public UNIQUE (public_id),
  CONSTRAINT uk_feed_profile_nickname UNIQUE (nickname_key),
  CONSTRAINT fk_feed_profile_member FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_post (
  post_id BIGINT NOT NULL AUTO_INCREMENT,
  profile_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  region VARCHAR(50),
  store_id BIGINT,
  promotion_id BIGINT,
  news_promotion_id BIGINT,
  state VARCHAR(16) NOT NULL,
  revision BIGINT NOT NULL,
  client_request_id VARCHAR(36),
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  deleted_at DATETIME(6),
  PRIMARY KEY (post_id),
  CONSTRAINT uk_feed_post_request UNIQUE (profile_id,client_request_id),
  CONSTRAINT uk_feed_post_news UNIQUE (news_promotion_id),
  INDEX ix_feed_post_public (state,created_at,post_id),
  INDEX ix_feed_post_region (region,state,created_at,post_id),
  INDEX ix_feed_post_author (profile_id,state,created_at,post_id),
  INDEX ix_feed_post_deleted (state,deleted_at,post_id),
  CONSTRAINT fk_feed_post_profile FOREIGN KEY (profile_id) REFERENCES feed_profile(profile_id),
  CONSTRAINT fk_feed_post_store FOREIGN KEY (store_id) REFERENCES store(store_id) ON DELETE SET NULL,
  CONSTRAINT fk_feed_post_promotion FOREIGN KEY (promotion_id) REFERENCES promotion(promotion_id) ON DELETE SET NULL,
  CONSTRAINT fk_feed_post_news FOREIGN KEY (news_promotion_id) REFERENCES promotion(promotion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_media (
  media_id BIGINT NOT NULL AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  post_id BIGINT,
  original_post_id BIGINT,
  image_key VARCHAR(700) NOT NULL,
  content_type VARCHAR(40) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  byte_count BIGINT NOT NULL,
  position INT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  detached_at DATETIME(6),
  PRIMARY KEY (media_id),
  INDEX ix_feed_media_post (post_id,position,media_id),
  INDEX ix_feed_media_key (image_key),
  INDEX ix_feed_media_orphan (post_id,created_at,media_id),
  CONSTRAINT fk_feed_media_member FOREIGN KEY (member_id) REFERENCES member(member_id),
  CONSTRAINT fk_feed_media_post FOREIGN KEY (post_id) REFERENCES feed_post(post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_report (
  report_id BIGINT NOT NULL AUTO_INCREMENT,
  revision BIGINT NOT NULL DEFAULT 0,
  post_id BIGINT,
  promotion_id BIGINT,
  reporter_id BIGINT NOT NULL,
  reason VARCHAR(20) NOT NULL,
  detail VARCHAR(500),
  snapshot_json LONGTEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  hold BIT(1) NOT NULL,
  note VARCHAR(1000),
  created_at DATETIME(6) NOT NULL,
  resolved_at DATETIME(6),
  PRIMARY KEY (report_id),
  CONSTRAINT uk_feed_report_target UNIQUE (post_id,reporter_id),
  CONSTRAINT uk_feed_report_news UNIQUE (promotion_id,reporter_id),
  INDEX ix_feed_report_status (status,created_at,report_id),
  INDEX ix_feed_report_retention (status,hold,resolved_at,report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_report_image (
  evidence_id BIGINT NOT NULL AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  original_media_id BIGINT NOT NULL,
  owner_id BIGINT NOT NULL,
  image_key VARCHAR(700) NOT NULL,
  content_type VARCHAR(40) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  position INT NOT NULL,
  PRIMARY KEY (evidence_id),
  INDEX ix_feed_evidence_report (report_id,position,evidence_id),
  INDEX ix_feed_evidence_key (image_key),
  CONSTRAINT fk_feed_evidence_report FOREIGN KEY (report_id) REFERENCES feed_report(report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_audit_record (
  audit_id BIGINT NOT NULL AUTO_INCREMENT,
  actor_id BIGINT NOT NULL,
  action VARCHAR(32) NOT NULL,
  post_id BIGINT,
  promotion_id BIGINT,
  report_id BIGINT,
  reason VARCHAR(2000),
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (audit_id),
  INDEX ix_feed_audit_target (post_id,report_id,created_at,audit_id),
  INDEX ix_feed_audit_news (promotion_id,report_id,created_at,audit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Section 15.2: the new feed_post region is already VARCHAR(50).

CREATE TABLE content_like (
  like_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  post_id BIGINT,
  promotion_id BIGINT,
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT uk_content_like_post UNIQUE (member_id,post_id),
  CONSTRAINT uk_content_like_news UNIQUE (member_id,promotion_id),
  CONSTRAINT ck_content_like_target CHECK
    ((post_id IS NOT NULL AND promotion_id IS NULL) OR (post_id IS NULL AND promotion_id IS NOT NULL)),
  INDEX ix_content_like_member (member_id,created_at,like_id),
  CONSTRAINT fk_content_like_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE CASCADE,
  CONSTRAINT fk_content_like_post FOREIGN KEY (post_id) REFERENCES feed_post(post_id) ON DELETE CASCADE,
  CONSTRAINT fk_content_like_news FOREIGN KEY (promotion_id) REFERENCES promotion(promotion_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE feed_comment (
  comment_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT NOT NULL,
  profile_id BIGINT,
  parent_id BIGINT,
  content TEXT NOT NULL,
  state VARCHAR(16) NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  client_request_id VARCHAR(36),
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  deleted_at DATETIME(6),
  CONSTRAINT uk_feed_comment_request UNIQUE (profile_id,client_request_id),
  INDEX ix_feed_comment_post (post_id,parent_id,created_at,comment_id),
  INDEX ix_feed_comment_profile (profile_id,state,comment_id),
  INDEX ix_feed_comment_retention (state,deleted_at,comment_id),
  CONSTRAINT fk_feed_comment_post FOREIGN KEY (post_id) REFERENCES feed_post(post_id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_comment_profile FOREIGN KEY (profile_id) REFERENCES feed_profile(profile_id) ON DELETE SET NULL,
  CONSTRAINT fk_feed_comment_parent FOREIGN KEY (parent_id) REFERENCES feed_comment(comment_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE feed_comment_report (
  report_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  revision BIGINT NOT NULL DEFAULT 0,
  comment_id BIGINT NOT NULL,
  post_id BIGINT NOT NULL,
  reporter_id BIGINT NOT NULL,
  reason VARCHAR(20) NOT NULL,
  detail VARCHAR(500),
  snapshot_json LONGTEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  hold BIT(1) NOT NULL DEFAULT b'0',
  note VARCHAR(1000),
  created_at DATETIME(6) NOT NULL,
  resolved_at DATETIME(6),
  CONSTRAINT uk_feed_comment_report UNIQUE (comment_id,reporter_id),
  INDEX ix_feed_comment_report_status (status,created_at,report_id),
  INDEX ix_feed_comment_report_post (post_id,report_id),
  INDEX ix_feed_comment_report_retention (status,hold,resolved_at,report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Section 15.5: the two new report tables already contain revision.

ALTER TABLE chat_report ADD COLUMN revision BIGINT NOT NULL DEFAULT 0;

-- Included candidate: feed-comment-v6.sql; do not run it a second time.

-- Candidate DDL: apply with a reviewed DDL account after the manual-ddl.md 15.6 prerequisites.
-- Existing two-target check may have a Hibernate-generated name. Replace it in the same ALTER.
SET @legacy_like_check = (
    SELECT IF(COUNT(*)=1,MIN(tc.CONSTRAINT_NAME),NULL)
    FROM information_schema.TABLE_CONSTRAINTS tc
    JOIN information_schema.CHECK_CONSTRAINTS cc
      ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME
    WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME='content_like' AND tc.CONSTRAINT_TYPE='CHECK'
      AND cc.CHECK_CLAUSE LIKE '%post_id%' AND cc.CHECK_CLAUSE LIKE '%promotion_id%'
      AND cc.CHECK_CLAUSE NOT LIKE '%comment_id%'
);
SET @like_ddl = CONCAT('ALTER TABLE content_like ADD COLUMN comment_id BIGINT NULL, ADD CONSTRAINT uk_content_like_comment UNIQUE (member_id,comment_id), ADD CONSTRAINT fk_content_like_comment FOREIGN KEY (comment_id) REFERENCES feed_comment(comment_id) ON DELETE CASCADE, DROP CHECK `',REPLACE(@legacy_like_check,'`','``'),'`, ADD CONSTRAINT ck_content_like_target CHECK ((post_id IS NOT NULL AND promotion_id IS NULL AND comment_id IS NULL) OR (post_id IS NULL AND promotion_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND promotion_id IS NULL AND comment_id IS NOT NULL))');
PREPARE alter_comment_like FROM @like_ddl;
EXECUTE alter_comment_like;
DEALLOCATE PREPARE alter_comment_like;

ALTER TABLE feed_media
    ADD COLUMN comment_id BIGINT NULL,
    ADD COLUMN original_comment_id BIGINT NULL,
    ADD INDEX ix_feed_media_comment (comment_id,position,media_id),
    ADD CONSTRAINT fk_feed_media_comment FOREIGN KEY (comment_id) REFERENCES feed_comment(comment_id),
    ADD CONSTRAINT ck_feed_media_parent CHECK (
        NOT (post_id IS NOT NULL AND comment_id IS NOT NULL)
        AND NOT (original_post_id IS NOT NULL AND original_comment_id IS NOT NULL)
    );

CREATE TABLE feed_comment_report_image (
    evidence_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    report_id BIGINT NOT NULL,
    owner_id BIGINT NOT NULL,
    original_media_id BIGINT NOT NULL,
    image_key VARCHAR(700) NOT NULL,
    content_type VARCHAR(40) NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    position INT NOT NULL,
    INDEX ix_comment_evidence_report (report_id,position,evidence_id),
    INDEX ix_comment_evidence_key (image_key),
    CONSTRAINT fk_comment_evidence_report FOREIGN KEY (report_id) REFERENCES feed_comment_report(report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_notification (
    notification_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT NOT NULL,
    actor_profile_id BIGINT NOT NULL,
    comment_id BIGINT NOT NULL,
    kind VARCHAR(20) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    read_at DATETIME(6) NULL,
    CONSTRAINT uk_feed_notification_event UNIQUE (member_id,actor_profile_id,comment_id,kind),
    INDEX ix_feed_notification_member (member_id,read_at,created_at,notification_id),
    CONSTRAINT fk_feed_notification_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE CASCADE,
    CONSTRAINT fk_feed_notification_actor FOREIGN KEY (actor_profile_id) REFERENCES feed_profile(profile_id) ON DELETE CASCADE,
    CONSTRAINT fk_feed_notification_comment FOREIGN KEY (comment_id) REFERENCES feed_comment(comment_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Included candidate: benefit-design.sql; do not run it a second time.

-- Apply once after checking the target and information_schema.COLUMNS.
-- Existing rows and clients keep the standard template.
ALTER TABLE promotion
  ADD COLUMN benefit_design VARCHAR(16) NOT NULL DEFAULT 'STANDARD',
  ADD CONSTRAINT ck_promotion_benefit_design CHECK (benefit_design IN ('STANDARD', 'PHOTO', 'COMPACT'));

-- Included candidate: feed-profile-avatar.sql; do not run it a second time.

-- Apply once after checking the target and information_schema.COLUMNS / TABLE_CONSTRAINTS.
-- Existing opt-outs stay private; no use_account_avatar backfill is performed.
ALTER TABLE feed_profile
  ADD COLUMN custom_avatar_key VARCHAR(1024) NULL,
  ADD CONSTRAINT ck_feed_profile_avatar_source
    CHECK (custom_avatar_key IS NULL OR (use_account_avatar = FALSE AND CHAR_LENGTH(custom_avatar_key) > 0));

SELECT 'V6_SELECTED_DDL_COMPLETED' AS result;
