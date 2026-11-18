ALTER TABLE reservation ADD COLUMN review_written BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE reservation r
JOIN review v ON v.reservation_id = r.reservation_id
SET r.review_written = TRUE
WHERE r.review_written = FALSE;
