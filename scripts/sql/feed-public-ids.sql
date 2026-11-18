-- 피드 게시물·댓글과 가게 소식의 기존 행에 공개 UUIDv4를 부여한다.
-- 이미 부여한 주소와 기존 숫자 기본키·외래 키는 유지한다.

SET @public_id_ddl = CASE
    WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'feed_post' AND column_name = 'public_id'
    ) THEN 'ALTER TABLE feed_post ADD COLUMN public_id VARCHAR(36) NULL, ADD UNIQUE KEY uk_feed_post_public_id (public_id)'
    WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'feed_post' AND index_name = 'uk_feed_post_public_id'
         GROUP BY index_name
        HAVING COUNT(*) = 1 AND MAX(non_unique) = 0 AND MAX(column_name) = 'public_id'
    ) THEN 'ALTER TABLE feed_post ADD UNIQUE KEY uk_feed_post_public_id (public_id)'
    ELSE 'DO 0'
END;
PREPARE public_id_ddl FROM @public_id_ddl;
EXECUTE public_id_ddl;
DEALLOCATE PREPARE public_id_ddl;

UPDATE feed_post
   SET public_id = LOWER(CONCAT(
       HEX(RANDOM_BYTES(4)), '-', HEX(RANDOM_BYTES(2)), '-4', RIGHT(HEX(RANDOM_BYTES(2)), 3),
       '-', SUBSTRING('89ab', 1 + MOD(ORD(RANDOM_BYTES(1)), 4), 1), RIGHT(HEX(RANDOM_BYTES(2)), 3),
       '-', HEX(RANDOM_BYTES(6))
   ))
 WHERE public_id IS NULL;

SET @public_id_ddl = CASE
    WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'feed_comment' AND column_name = 'public_id'
    ) THEN 'ALTER TABLE feed_comment ADD COLUMN public_id VARCHAR(36) NULL, ADD UNIQUE KEY uk_feed_comment_public_id (public_id)'
    WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'feed_comment' AND index_name = 'uk_feed_comment_public_id'
         GROUP BY index_name
        HAVING COUNT(*) = 1 AND MAX(non_unique) = 0 AND MAX(column_name) = 'public_id'
    ) THEN 'ALTER TABLE feed_comment ADD UNIQUE KEY uk_feed_comment_public_id (public_id)'
    ELSE 'DO 0'
END;
PREPARE public_id_ddl FROM @public_id_ddl;
EXECUTE public_id_ddl;
DEALLOCATE PREPARE public_id_ddl;

UPDATE feed_comment
   SET public_id = LOWER(CONCAT(
       HEX(RANDOM_BYTES(4)), '-', HEX(RANDOM_BYTES(2)), '-4', RIGHT(HEX(RANDOM_BYTES(2)), 3),
       '-', SUBSTRING('89ab', 1 + MOD(ORD(RANDOM_BYTES(1)), 4), 1), RIGHT(HEX(RANDOM_BYTES(2)), 3),
       '-', HEX(RANDOM_BYTES(6))
   ))
 WHERE public_id IS NULL;

SET @public_id_ddl = CASE
    WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'promotion' AND column_name = 'public_id'
    ) THEN 'ALTER TABLE promotion ADD COLUMN public_id VARCHAR(36) NULL, ADD UNIQUE KEY uk_promotion_public_id (public_id)'
    WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'promotion' AND index_name = 'uk_promotion_public_id'
         GROUP BY index_name
        HAVING COUNT(*) = 1 AND MAX(non_unique) = 0 AND MAX(column_name) = 'public_id'
    ) THEN 'ALTER TABLE promotion ADD UNIQUE KEY uk_promotion_public_id (public_id)'
    ELSE 'DO 0'
END;
PREPARE public_id_ddl FROM @public_id_ddl;
EXECUTE public_id_ddl;
DEALLOCATE PREPARE public_id_ddl;

UPDATE promotion
   SET public_id = LOWER(CONCAT(
       HEX(RANDOM_BYTES(4)), '-', HEX(RANDOM_BYTES(2)), '-4', RIGHT(HEX(RANDOM_BYTES(2)), 3),
       '-', SUBSTRING('89ab', 1 + MOD(ORD(RANDOM_BYTES(1)), 4), 1), RIGHT(HEX(RANDOM_BYTES(2)), 3),
       '-', HEX(RANDOM_BYTES(6))
   ))
 WHERE public_id IS NULL;

SELECT 'feed_post' AS table_name, COUNT(*) AS rows_without_public_id FROM feed_post WHERE public_id IS NULL
UNION ALL
SELECT 'feed_comment', COUNT(*) FROM feed_comment WHERE public_id IS NULL
UNION ALL
SELECT 'promotion', COUNT(*) FROM promotion WHERE public_id IS NULL;
