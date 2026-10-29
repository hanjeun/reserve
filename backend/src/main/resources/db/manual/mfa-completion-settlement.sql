-- 신규 후보용 추가 DDL이에요. 기존 구조 대조·백업·독립 복원 뒤 별도 승인한 DDL 계정으로 적용해요.
-- MFA 등록 뒤에는 v11 호환 복구 이미지와 같은 MFA 암호화 키를 유지해야 해요.
CREATE TABLE mfa_account (
    member_id BIGINT NOT NULL PRIMARY KEY,
    user_handle VARCHAR(36) NOT NULL,
    enabled BOOLEAN NOT NULL,
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT uk_mfa_account_handle UNIQUE (user_handle)
) ENGINE=InnoDB;
CREATE TABLE mfa_credential (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    member_id BIGINT NOT NULL,
    kind VARCHAR(16) NOT NULL,
    slot_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(80) NOT NULL,
    credential_id VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin NULL,
    public_key_cose VARCHAR(4096) CHARACTER SET ascii COLLATE ascii_bin NULL,
    signature_count BIGINT NOT NULL,
    transports VARCHAR(255) NULL,
    backup_eligible BOOLEAN NOT NULL,
    backed_up BOOLEAN NOT NULL,
    secret_ciphertext VARCHAR(512) NULL,
    last_accepted_step BIGINT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    last_used_at DATETIME(6) NULL,
    CONSTRAINT uk_mfa_credential_slot UNIQUE (slot_key),
    INDEX idx_mfa_credential_member (member_id)
) ENGINE=InnoDB;
CREATE TABLE mfa_challenge (
    id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    member_id BIGINT NULL,
    purpose VARCHAR(20) NOT NULL,
    primary_method VARCHAR(20) NULL,
    auth_version INT NOT NULL,
    bound_session_id VARCHAR(36) NULL,
    oauth_at DATETIME(6) NULL,
    expires_at DATETIME(6) NOT NULL,
    failures INT NOT NULL,
    factor_verified BOOLEAN NOT NULL,
    ceremony_type VARCHAR(16) NULL,
    ceremony_json TEXT NULL,
    pending_secret VARCHAR(512) NULL,
    consumed_at DATETIME(6) NULL,
    INDEX idx_mfa_challenge_expiry (expires_at),
    INDEX idx_mfa_challenge_member (member_id)
) ENGINE=InnoDB;
CREATE TABLE mfa_recovery_code (
    digest VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    member_id BIGINT NOT NULL,
    INDEX idx_mfa_recovery_member (member_id)
) ENGINE=InnoDB;
CREATE TABLE test_settlement_payout (
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    payment_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    owner_id BIGINT NOT NULL,
    amount BIGINT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    INDEX idx_test_settlement_payment (payment_id),
    INDEX idx_test_settlement_store (store_id, created_at)
) ENGINE=InnoDB;
ALTER TABLE store
    ADD COLUMN auto_completion_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN service_duration_minutes INT NOT NULL DEFAULT 60;
ALTER TABLE reservation
    ADD COLUMN auto_completion_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN attendance_refund_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN service_duration_minutes INT NULL,
    ADD COLUMN usage_ends_at DATETIME(6) NULL,
    ADD INDEX idx_reservation_auto_completion (auto_completion_enabled, status, usage_ends_at);
ALTER TABLE payment
    ADD COLUMN verified_channel_type VARCHAR(16) NULL,
    ADD COLUMN verified_channel_id VARCHAR(80) NULL,
    ADD COLUMN verified_store_id VARCHAR(80) NULL,
    ADD COLUMN verified_disputed BOOLEAN NULL;
-- 기존 예약은 수동 완료·기존 환불 계약을 유지하고, 과거 결제를 TEST로 추정해 채우지 않아요.
