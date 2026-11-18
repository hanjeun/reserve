ALTER TABLE review ADD COLUMN author_alias VARCHAR(30) NULL;

CREATE TABLE review_like (
    review_like_id BIGINT NOT NULL AUTO_INCREMENT,
    review_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    PRIMARY KEY (review_like_id),
    UNIQUE KEY uk_review_like_review_member (review_id, member_id),
    CONSTRAINT fk_review_like_review FOREIGN KEY (review_id) REFERENCES review (review_id) ON DELETE CASCADE,
    CONSTRAINT fk_review_like_member FOREIGN KEY (member_id) REFERENCES member (member_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE review_comment (
    review_comment_id BIGINT NOT NULL AUTO_INCREMENT,
    review_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    client_request_id VARCHAR(36) NOT NULL,
    content VARCHAR(500) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (review_comment_id),
    UNIQUE KEY uk_review_comment_request (review_id, member_id, client_request_id),
    KEY idx_review_comment_order (review_id, created_at, review_comment_id),
    CONSTRAINT fk_review_comment_review FOREIGN KEY (review_id) REFERENCES review (review_id) ON DELETE CASCADE,
    CONSTRAINT fk_review_comment_member FOREIGN KEY (member_id) REFERENCES member (member_id) ON DELETE CASCADE
) ENGINE=InnoDB;
