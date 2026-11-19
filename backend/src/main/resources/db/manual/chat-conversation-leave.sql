ALTER TABLE chat_room
    ADD COLUMN member_left_at DATETIME(6) NULL,
    ADD COLUMN owner_left_by_member_id BIGINT NULL;
