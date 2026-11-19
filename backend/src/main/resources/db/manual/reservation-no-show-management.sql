ALTER TABLE reservation
    ADD COLUMN manual_visit_confirmed_at DATETIME(6) NULL,
    ADD COLUMN no_show_previous_status VARCHAR(20) NULL;

CREATE TABLE store_booking_restriction (
    id BIGINT NOT NULL AUTO_INCREMENT,
    store_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    ends_at DATETIME(6) NOT NULL,
    reason VARCHAR(200) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_store_booking_restriction UNIQUE (store_id, member_id),
    CONSTRAINT fk_store_booking_restriction_store FOREIGN KEY (store_id) REFERENCES store(store_id) ON DELETE CASCADE,
    CONSTRAINT fk_store_booking_restriction_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE CASCADE,
    KEY idx_store_booking_restriction_expiry (ends_at)
) ENGINE=InnoDB;
