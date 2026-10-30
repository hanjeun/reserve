-- 운영 적용은 별도 승인과 제한 계정 검증 후 진행한다.
CREATE TABLE IF NOT EXISTS reservation_consent (
    reservation_id BIGINT NOT NULL PRIMARY KEY,
    member_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    recipient_id BIGINT NOT NULL,
    notice_version VARCHAR(32) NOT NULL,
    notice_hash CHAR(64) NOT NULL,
    notice_snapshot LONGTEXT NOT NULL,
    privacy_accepted BOOLEAN NOT NULL,
    conditions_accepted BOOLEAN NOT NULL,
    accepted_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    INDEX idx_reservation_consent_expiry (expires_at),
    CONSTRAINT fk_reservation_consent_reservation FOREIGN KEY (reservation_id) REFERENCES reservation(reservation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
