-- 보호 시작 전 실제 릴리스 JAR과 복구 버전의 호환성을 확인해요.
ALTER TABLE member
    ADD COLUMN security_contact_email VARCHAR(254) NULL,
    ADD COLUMN account_recovery_digest VARCHAR(64) NULL,
    ADD COLUMN account_recovery_expires_at DATETIME(6) NULL,
    ADD COLUMN account_recovery_mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT uk_member_account_recovery_digest UNIQUE (account_recovery_digest);

ALTER TABLE mfa_challenge
    ADD COLUMN target_member_id BIGINT NULL,
    ADD COLUMN target_auth_version INT NULL;
