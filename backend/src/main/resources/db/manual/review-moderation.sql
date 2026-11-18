ALTER TABLE review
    ADD COLUMN moderation_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN owner_reply VARCHAR(500) NULL,
    ADD COLUMN owner_replied_at DATETIME(6) NULL;
