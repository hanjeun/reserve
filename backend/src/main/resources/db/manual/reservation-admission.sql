-- 스키마 검증 전에 승인된 DDL 계정으로 추가한다. information_schema에서 기존 구조를 확인한다.
-- 반복 실행하거나 운영 ddl-auto:update로 우회하지 않는다.
CREATE TABLE reservation_request (
    request_id BIGINT NOT NULL AUTO_INCREMENT,
    member_id BIGINT NOT NULL,
    request_key VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reservation_id BIGINT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (request_id),
    CONSTRAINT uk_reservation_request_member_key UNIQUE (member_id, request_key),
    CONSTRAINT fk_reservation_request_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE CASCADE,
    CONSTRAINT fk_reservation_request_reservation FOREIGN KEY (reservation_id) REFERENCES reservation(reservation_id) ON DELETE CASCADE
) ENGINE=InnoDB;
