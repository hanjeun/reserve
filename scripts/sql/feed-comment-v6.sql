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
