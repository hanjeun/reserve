-- 현재 스키마·최종 JAR·직전 백업/격리 복원·호환 복구 입력과 운영 DDL 승인이 필요하다.
-- mysql CLI에 --force를 사용하지 않으며, 같은 SQL을 중복 실행하지 않는다.
-- 부분 실패 시 메타데이터를 확인하고 남은 구문만 준비한다.

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

-- 암호화 후에도 기존 최대 길이 토큰을 담을 수 있어야 하며, 기존 값·문자셋·정렬 규칙은 유지한다.
ALTER TABLE member
  MODIFY COLUMN oauth_access_token TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  ADD COLUMN oauth_authenticated_at DATETIME(6) NULL,
  ADD COLUMN oauth_security_revoked_at DATETIME(6) NULL,
  ADD INDEX idx_member_oauth_subject (provider, provider_id, deleted_at);

-- 회원 생성 전 수신한 사건도 처리하며 로그인·보안 사건은 회원·세션보다 이 행을 먼저 잠근다.
CREATE TABLE oauth_subject_security (
  subject_key CHAR(64) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  last_authenticated_at DATETIME(6) NULL,
  revoked_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (subject_key),
  CONSTRAINT ck_oauth_subject_security_provider CHECK (provider IN ('GOOGLE', 'KAKAO', 'NAVER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 재전송 방지에 필요한 최소 정보만 저장하며 원문 사건·공급자 식별자·이메일·토큰은 남기지 않는다.
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
