-- 운영 적용·활성화는 별도 승인과 제한 계정·독립 복원 검증을 거쳐요.
CREATE TABLE IF NOT EXISTS reservation_retention_hold (
    retention_hold_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    reservation_id BIGINT NOT NULL,
    case_reference VARCHAR(80) NOT NULL,
    purpose VARCHAR(32) NOT NULL,
    held_by BIGINT NOT NULL,
    held_at DATETIME(6) NOT NULL,
    released_by BIGINT NULL,
    released_at DATETIME(6) NULL,
    INDEX idx_reservation_retention_hold (reservation_id, released_at),
    CONSTRAINT fk_reservation_retention_hold FOREIGN KEY (reservation_id) REFERENCES reservation(reservation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
