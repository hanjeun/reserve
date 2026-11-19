-- 기존 접수 행과 가게 명단을 보존하고 고객의 목록 표시 여부만 추가한다.
SET @waiting_customer_hidden_ddl = IF(
    EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'waiting_entry' AND column_name = 'customer_hidden_at'
    ),
    'DO 0',
    'ALTER TABLE waiting_entry ADD COLUMN customer_hidden_at DATETIME(6) NULL'
);
PREPARE waiting_customer_hidden_ddl FROM @waiting_customer_hidden_ddl;
EXECUTE waiting_customer_hidden_ddl;
DEALLOCATE PREPARE waiting_customer_hidden_ddl;
