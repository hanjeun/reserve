-- 공개 주소만 추가하며 숫자 기본키·외래 키와 구버전 쓰기 호환성을 보존한다.
SET @store_public_id_ddl = CASE
    WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'store' AND column_name = 'public_id'
    ) THEN 'ALTER TABLE store ADD COLUMN public_id VARCHAR(36) NULL, ADD UNIQUE KEY uk_store_public_id (public_id)'
    WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'store' AND index_name = 'uk_store_public_id'
         GROUP BY index_name
        HAVING COUNT(*) = 1 AND MAX(non_unique) = 0 AND MAX(column_name) = 'public_id'
    ) THEN 'ALTER TABLE store ADD UNIQUE KEY uk_store_public_id (public_id)'
    ELSE 'DO 0'
END;
PREPARE store_public_id_ddl FROM @store_public_id_ddl;
EXECUTE store_public_id_ddl;
DEALLOCATE PREPARE store_public_id_ddl;

-- UUIDv4의 버전·변형 비트를 고정하고 나머지를 난수로 채운다.
UPDATE store
   SET public_id = LOWER(CONCAT(
       HEX(RANDOM_BYTES(4)), '-', HEX(RANDOM_BYTES(2)), '-4', RIGHT(HEX(RANDOM_BYTES(2)), 3),
       '-', SUBSTRING('89ab', 1 + MOD(ORD(RANDOM_BYTES(1)), 4), 1), RIGHT(HEX(RANDOM_BYTES(2)), 3),
       '-', HEX(RANDOM_BYTES(6))
   ))
 WHERE public_id IS NULL;

SELECT COUNT(*) AS stores_without_public_id FROM store WHERE public_id IS NULL;
