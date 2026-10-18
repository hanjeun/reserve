-- Candidate only. Production DDL requires the final JAR, current schema comparison,
-- a fresh independently downloaded/restored backup, compatible recovery inputs, and approval.
-- Baseline: the verified 2026-10-14 backup, MySQL 8.0.45 / reserve.
-- Run in the mysql CLI WITHOUT --force. Do not concatenate section 16's SQL again.
-- After any partial failure, inspect metadata and prepare only the remaining statements.

SET @reserve_oauth_v7_preflight_sql = IF(
    DATABASE() = 'reserve' AND VERSION() = '8.0.45'
    AND (SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member'
           AND TABLE_TYPE = 'BASE TABLE' AND ENGINE = 'InnoDB') = 1
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member'
           AND COLUMN_NAME = 'member_id' AND COLUMN_KEY = 'PRI' AND COLUMN_TYPE = 'bigint') = 1
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member'
           AND COLUMN_NAME = 'oauth_access_token' AND COLUMN_TYPE = 'varchar(2048)'
           AND IS_NULLABLE = 'YES' AND CHARACTER_SET_NAME = 'utf8mb4'
           AND COLLATION_NAME = 'utf8mb4_0900_ai_ci') = 1
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member'
           AND COLUMN_NAME IN ('oauth_authenticated_at', 'oauth_security_revoked_at')) = 0
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member' AND IS_NULLABLE = 'YES'
           AND ((COLUMN_NAME = 'provider' AND COLUMN_TYPE = 'enum(''GOOGLE'',''KAKAO'',''LOCAL'',''NAVER'')')
             OR (COLUMN_NAME = 'provider_id' AND COLUMN_TYPE = 'varchar(255)')
             OR (COLUMN_NAME = 'deleted_at' AND COLUMN_TYPE = 'datetime(6)'))) = 3
    AND (SELECT COUNT(*) FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member'
           AND INDEX_NAME = 'idx_member_oauth_subject') = 0
    AND (SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('oauth_security_event','oauth_subject_security')) = 0,
    'SELECT ''OAUTH_V7_PREFLIGHT_OK'' AS result',
    NULL
);
PREPARE reserve_oauth_v7_preflight FROM @reserve_oauth_v7_preflight_sql;
EXECUTE reserve_oauth_v7_preflight;
DEALLOCATE PREPARE reserve_oauth_v7_preflight;

-- AES-GCM's envelope must also accommodate a previously valid 2048-character token.
-- Existing values and the source column's charset/collation are preserved; no token backfill.
ALTER TABLE member
  MODIFY COLUMN oauth_access_token TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  ADD COLUMN oauth_authenticated_at DATETIME(6) NULL,
  ADD COLUMN oauth_security_revoked_at DATETIME(6) NULL,
  ADD INDEX idx_member_oauth_subject (provider, provider_id, deleted_at);

-- Pseudonymous provider identity state, including events received before a member exists.
-- Both login and security events lock this row before member/refresh-token rows.
CREATE TABLE oauth_subject_security (
  subject_key CHAR(64) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  last_authenticated_at DATETIME(6) NULL,
  revoked_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (subject_key),
  CONSTRAINT ck_oauth_subject_security_provider CHECK (provider IN ('GOOGLE', 'KAKAO', 'NAVER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Minimal replay protection: no raw event, provider subject, email, or token is stored here.
CREATE TABLE oauth_security_event (
  oauth_security_event_id BIGINT NOT NULL AUTO_INCREMENT,
  provider VARCHAR(20) NOT NULL,
  event_hash CHAR(64) NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  processed_at DATETIME(6) NOT NULL,
  outcome VARCHAR(20) NOT NULL,
  PRIMARY KEY (oauth_security_event_id),
  CONSTRAINT uk_oauth_security_event_hash UNIQUE (event_hash),
  INDEX idx_oauth_security_event_processed (processed_at),
  CONSTRAINT ck_oauth_security_event_provider CHECK (provider IN ('GOOGLE', 'KAKAO', 'NAVER')),
  CONSTRAINT ck_oauth_security_event_outcome CHECK (outcome IN ('APPLIED', 'IGNORED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
