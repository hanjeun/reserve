-- Additive preparation only. Apply using the approved DDL account before schema validation.
-- Inspect information_schema first; do not run repeatedly or enable ddl-auto:update in production.
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
