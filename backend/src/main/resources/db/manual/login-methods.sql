-- Manual, additive preparation. Apply with the approved DDL role before deploying the matching application.
-- Existing member IDs, roles, provider links and business/transaction foreign keys are preserved.
ALTER TABLE member ADD COLUMN login_methods_managed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE login_method_challenge (
    id VARCHAR(36) NOT NULL,
    member_id BIGINT NOT NULL,
    auth_version INT NOT NULL,
    purpose ENUM('PASSWORD_SETUP', 'SOCIAL_LINK', 'SOCIAL_REAUTH') NOT NULL,
    provider ENUM('GOOGLE', 'KAKAO', 'LOCAL', 'NAVER') NULL,
    email VARCHAR(255) NULL,
    code_hash VARCHAR(100) NULL,
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    CONSTRAINT uk_login_method_member_purpose UNIQUE (member_id, purpose),
    CONSTRAINT fk_login_method_member FOREIGN KEY (member_id) REFERENCES member(member_id),
    INDEX idx_login_method_expiry (expires_at)
);
