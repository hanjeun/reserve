CREATE TABLE support_mail_photo (
    id BIGINT NOT NULL AUTO_INCREMENT,
    inquiry_id BIGINT NULL,
    sent_mail_id BIGINT NULL,
    filename VARCHAR(40) NOT NULL,
    content_type VARCHAR(24) NOT NULL,
    content MEDIUMBLOB NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_support_mail_photo_inquiry (inquiry_id, id),
    INDEX ix_support_mail_photo_sent (sent_mail_id, id),
    CONSTRAINT fk_support_mail_photo_inquiry FOREIGN KEY (inquiry_id) REFERENCES inquiry (inquiry_id) ON DELETE CASCADE,
    CONSTRAINT fk_support_mail_photo_sent FOREIGN KEY (sent_mail_id) REFERENCES admin_sent_mail (id) ON DELETE CASCADE
) ENGINE=InnoDB;
