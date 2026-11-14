-- 받은 문의를 휴지통에서 복구할 수 있도록 원본 행을 보존한다.
ALTER TABLE inquiry ADD COLUMN deleted_at DATETIME(6) NULL;
