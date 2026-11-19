ALTER TABLE store
    ADD COLUMN booking_opens_at DATETIME(6) NULL,
    ADD COLUMN booking_opening_from DATE NULL,
    ADD COLUMN booking_opening_to DATE NULL;
