-- PREPARATION ONLY. No application startup hook executes this file.
-- With the separately approved DDL role, create this additive table BEFORE starting the matching JAR with validate.
-- Business/member/payment records are untouched. UTC DATETIME values are independent of the server session zone.
-- Compatibility contract v10: all sid-less access/refresh cookies require ONE new login.
-- Old images cannot read this session contract; do not relabel or select an older image for rollback.
-- Recovery must use an image supporting login_session + sid/rgen/aud + hash-only refresh.
-- Keep the existing JWT secret as-is unless a separate key-rotation procedure is approved.
-- Optional jwt.signing-keys / active-key-id must retain the key of every live refresh generation during overlap.
-- Default absolute lifetime is 30 days; a refresh extends idle expiry by at most 14 days within that bound.

CREATE TABLE login_session (
    id BIGINT NOT NULL AUTO_INCREMENT,
    member_id BIGINT NOT NULL,
    session_id VARCHAR(36) NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL,
    previous_token_hash VARCHAR(64) NULL,
    rotation_version BIGINT NOT NULL,
    refresh_jti VARCHAR(36) NOT NULL,
    signing_key_id VARCHAR(48) NULL,
    created_at DATETIME(6) NOT NULL,
    issued_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    absolute_expires_at DATETIME(6) NOT NULL,
    rotated_at DATETIME(6) NULL,
    auth_version INT NOT NULL,
    oauth_authenticated_at DATETIME(6) NULL,
    login_method VARCHAR(16) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_login_session_sid UNIQUE (session_id),
    CONSTRAINT uk_login_session_hash UNIQUE (refresh_token_hash),
    INDEX idx_login_session_member (member_id),
    INDEX idx_login_session_expiry (expires_at)
);

-- The application never reads or writes the former refresh_token table after this cutover.
-- Preserve the existing refresh_token table and rows during this additive preparation.
-- Any later credential purge requires separate backup/recovery review and explicit approval.
-- Do not copy old bearer strings into login_session. Reissuing sid-less credentials would undo revocation guarantees.
