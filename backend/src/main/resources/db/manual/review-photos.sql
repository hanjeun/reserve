CREATE TABLE review_photo (
    review_photo_id BIGINT NOT NULL AUTO_INCREMENT,
    review_id BIGINT NOT NULL,
    object_key VARCHAR(512) NOT NULL,
    content_type VARCHAR(40) NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    PRIMARY KEY (review_photo_id),
    KEY idx_review_photo_review (review_id, review_photo_id),
    CONSTRAINT fk_review_photo_review FOREIGN KEY (review_id) REFERENCES review (review_id) ON DELETE CASCADE
) ENGINE=InnoDB;
