-- 예약 제한 기록은 예약 목록의 숨김과 삭제에 영향을 받지 않는다.
CREATE TABLE IF NOT EXISTS reservation_no_show_record (
    id BIGINT NOT NULL AUTO_INCREMENT,
    reservation_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    confirmed_at DATETIME(6) NOT NULL,
    corrected_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_no_show_reservation UNIQUE (reservation_id),
    CONSTRAINT fk_no_show_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE CASCADE,
    CONSTRAINT fk_no_show_store FOREIGN KEY (store_id) REFERENCES store(store_id) ON DELETE CASCADE,
    KEY idx_no_show_member_store_time (member_id, store_id, corrected_at, confirmed_at),
    KEY idx_no_show_confirmed_at (confirmed_at)
) ENGINE=InnoDB;
