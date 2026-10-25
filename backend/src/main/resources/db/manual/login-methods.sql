-- 대응 앱 배포 전에 승인된 DDL 계정으로 추가하는 수동 준비 SQL이다.
-- 기존 회원 ID·역할·제공자 연결과 사업·거래 외래 키는 보존한다.
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
