# 수동 DDL 런북

`ddl-auto: update`가 만들지 못하는 운영 DDL과 적용 절차예요.

`ddl-auto: update`는 새 컬럼 추가까지만 해요. 아래는 손으로 적용해요.

- 컬럼 **삭제**
- 컬럼 **타입 변경** (`VARCHAR(255)` → `VARCHAR(500)` 등)
- 제약 조건 변경 (NOT NULL, UNIQUE, FK)
- **FULLTEXT 인덱스**
- 인덱스 **이름 변경**

## 적용 원칙

1. 백업과 격리 `reserve_restore_*` 복원을 확인한 뒤 적용해요([백업·복구](backup.md)).
2. 운영 MySQL의 `SHOW CREATE TABLE`·인덱스·행 수를 읽기 전용으로 확인하고, 그 결과를 근거로 DDL을 검토해요.

접속:
```bash
export DB_PASSWORD="$(sudo sh -c '. /etc/reserve-backup.env; printf %s "$DB_PASSWORD"')"   # 비밀번호 기준: /etc/reserve-backup.env (backup.md 7장)
docker exec -it -e MYSQL_PWD="$DB_PASSWORD" mysql mysql -u root reserve
```

## 1. 가게 검색 FULLTEXT 인덱스 (ngram)

가게 키워드 검색이 `store` 풀스캔 없이 인덱스를 타게 해요.

### DDL

```sql
-- ① ngram 파서 확인 (한글은 단어 경계가 없어 기본 파서로는 색인되지 않는다)
SHOW VARIABLES LIKE 'ngram_token_size';        -- 기본 2. 이 값이 최소 검색어 길이가 된다.

-- ② 인덱스 생성
--    MATCH() 대상 컬럼 목록과 FULLTEXT 인덱스 정의가 일치해야 한다.
--    StoreRepository.searchStoresFulltextPaged 의 MATCH(...) 와 함께 관리한다.
ALTER TABLE store
  ADD FULLTEXT INDEX ft_store_search (store_name, description, address, category, keywords)
  WITH PARSER ngram;

-- ③ 확인
SHOW INDEX FROM store WHERE Index_type = 'FULLTEXT';
```

### 적용 후 켜기

DDL을 적용한 뒤 `application-prod.yml`에서 켜요.

```yaml
search:
  store:
    fulltext-enabled: true
```

### 확인 방법

```sql
-- 풀스캔이 사라졌는지: type=fulltext, key=ft_store_search 가 나와야 한다
EXPLAIN SELECT * FROM store
 WHERE MATCH(store_name, description, address, category, keywords)
       AGAINST('+강남' IN BOOLEAN MODE);
```

### 검색 코드 규칙

- LIKE와 FULLTEXT 모두 `deleted_at IS NULL AND status = 'ACTIVE'`를 적용하고, 내용 쿼리와 count 조건을 맞춰요.
- 별점·리뷰·최신순은 DB 전체 정렬 후 페이지예요. 동점은 `store_id DESC`로 고정해요.
- 거리순은 1,000km bounding-box 좌표 후보만 DB에서 고르고, cosine 내림차순·`store_id DESC`로 정렬해요.
- 1글자 토큰·BOOLEAN 연산자를 걷어 낸 뒤 빈 검색어는 LIKE로 돌아가요.
- LIKE의 `%`·`_`·escape 문자는 문자 그대로 검색해요.
- 짧은 토큰 분기는 `ngram_token_size=2`를 전제로 해요.
- 분야·지역·추천·거리 조건이 있으면 LIKE Specification 경로를 써요.

참고 문서: [MySQL FULLTEXT 제한](https://dev.mysql.com/doc/refman/8.0/en/fulltext-restrictions.html),
[ngram 파서](https://dev.mysql.com/doc/refman/8.0/en/fulltext-search-ngram.html).

## 1-b. 가게 거리순 bounding-box 후보 인덱스

거리순 후보 조회용 인덱스예요. 별도 MySQL 8에서 `EXPLAIN ANALYZE`로 확인한 뒤 적용해요.

```sql
-- 실제 운영에는 백업·격리 복원 관문과 승인 후 적용한다.
ALTER TABLE store
  ADD INDEX idx_store_public_location (status, deleted_at, latitude, longitude);

SHOW INDEX FROM store WHERE Key_name = 'idx_store_public_location';

EXPLAIN ANALYZE
SELECT store_id
FROM store
WHERE status = 'ACTIVE'
  AND deleted_at IS NULL
  AND latitude BETWEEN 28.0 AND 46.0
  AND longitude BETWEEN 115.0 AND 139.0
ORDER BY
  SIN(RADIANS(37.5665)) * SIN(RADIANS(latitude))
  + COS(RADIANS(37.5665)) * COS(RADIANS(latitude))
    * COS(RADIANS(longitude - 126.9780)) DESC,
  store_id DESC
LIMIT 20;
```

위 수치는 서울 기준 예시예요. 실제 앱은 요청 좌표에서 경계값을 계산해요.

## 2. 광고 금융 원장: 배포 전후 스키마 확인

새 테이블은 `ad_payment_attempt`예요. `advertisement.status`에 `REFUND_PENDING`, `REVIEW_REQUIRED`가 추가되고, 코드가 기대하는 타입은 `varchar(20)`이에요.

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'advertisement'
  AND COLUMN_NAME = 'status';

-- 새 코드의 스키마 생성 후 확인
SHOW CREATE TABLE ad_payment_attempt;
SHOW INDEX FROM ad_payment_attempt;
```

- merchant_uid UNIQUE, 식별자/원금 NOT NULL, due/store/owner/ad 인덱스를 확인해요.
- 롤백 경계는 [광고 결제 런북](ad-payments.md)을 따라요.

## 3. 계정 보안·로그인 유지: 배포 전후 확인

`ddl-auto: update`가 아래를 만들어요.

| 대상 | 변경 | 쓰는 곳 |
|---|---|---|
| `member.auth_version` | `INT NOT NULL DEFAULT 0` 추가 | 비밀번호 변경·재설정 시 모든 세션 무효화 |
| `refresh_token.previous_token_hash` | `VARCHAR(64) NULL` + `idx_refresh_token_previous_hash` | refresh 회전 직전 토큰 식별 |
| `refresh_token.rotated_at` | `DATETIME(6) NULL` | 직전 토큰 유예(60초) 판정 |
| `oauth_unlink_task` | 새 테이블 | 탈퇴 OAuth 연동 해제 outbox |
| `marketing_consent_history` | 새 테이블 | 마케팅 동의·철회 이력(append-only) |

새 앱 기동 뒤 읽기 전용으로 확인해요(`scripts/verify-post-deploy-readonly.sh`가 같은 항목을 봐요).

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'member' AND COLUMN_NAME = 'auth_version')
    OR (TABLE_NAME = 'refresh_token' AND COLUMN_NAME IN ('previous_token_hash', 'rotated_at')));

SELECT COUNT(*) AS invalid_auth_versions
FROM member
WHERE auth_version IS NULL OR auth_version < 0;

SHOW INDEX FROM refresh_token;
SHOW CREATE TABLE oauth_unlink_task;
SHOW INDEX FROM oauth_unlink_task;
SHOW CREATE TABLE marketing_consent_history;
SHOW INDEX FROM marketing_consent_history;
```

- `auth_version`은 `INT NOT NULL DEFAULT 0`, 기존 회원은 모두 0이어야 해요.
- `idx_refresh_token_previous_hash`가 없으면 백업 뒤 아래를 적용해요.
  ```sql
  CREATE INDEX idx_refresh_token_previous_hash ON refresh_token (previous_token_hash);
  ```
- `oauth_unlink_task.task_key` unique(`uk_oauth_unlink_task_key`), `(status,next_attempt_at)` 인덱스, nullable `lease_id`를 확인해요.
- 마케팅 동의 이력은 `(member_id,created_at)` 인덱스를 확인해요.

## 4. 통합 메시지·신고: 배포 전후 확인

통합 메시지는 기존 `chat_room`/`chat_message`를 확장하고 `chat_report`를 새로 만들어요. 앱 기동 뒤 아래를 읽기 전용으로 확인해요.

```sql
SHOW CREATE TABLE chat_room;
SHOW INDEX FROM chat_room;
SHOW CREATE TABLE chat_message;
SHOW INDEX FROM chat_message;
SHOW CREATE TABLE chat_report;
SHOW INDEX FROM chat_report;

SELECT type, COUNT(*) AS rooms
FROM chat_room
GROUP BY type;

SELECT COUNT(*) AS invalid_unread
FROM chat_room
WHERE member_unread < 0 OR admin_unread < 0 OR owner_unread < 0;
```

- `chat_room`의 `store_id`, `store_name_snapshot`, `owner_unread`, `last_message_preview`,
  `member_blocked_at`, `owner_blocked_at`과 `(store_id,type,last_message_at)` 인덱스를 확인해요.
- 고객지원 enum 문자열은 `SUPPORT`, 가게 문의는 `STORE`예요.
- `chat_message`의 `(room_id,sender_member_id,client_message_id)` unique와 `(room_id,id)` 인덱스를 확인해요.
- `chat_report.report_key` unique, `(status,created_at)`과 `(room_id,created_at)` 인덱스를 확인해요.
- 기존 `SUPPORT` 방은 `owner_unread`가 0이고 차단 시각이 null이어야 해요.

### `sender_role` OWNER 추가

`sender_role`은 `ADMIN`/`MEMBER`/**`OWNER`**를 저장할 수 있어야 해요. native ENUM은 `ddl-auto`가 새 상수를 반영하지 않으므로 OWNER만 추가해요. 후보 스키마 검사(`RESERVE_VERIFY_PREVIEW_SCHEMA=1`)가 OWNER 없는 ENUM을 실패로 봐요.

```sql
SELECT COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_message' AND COLUMN_NAME = 'sender_role';

-- 백업 가용성/격리 검증/별도 승인 뒤, 새 STORE 답장 첫 쓰기 전에 실행할 제안
ALTER TABLE chat_message
  MODIFY COLUMN sender_role ENUM('ADMIN','MEMBER','OWNER') NOT NULL;
```

## 5. `reservation.checked_in_at` 시간대 백필 (KST → UTC)

체크인 시각은 UTC로 저장하고 응답에서 한국 시각으로 바꿔요. KST로 저장된 기존 행을 UTC로 옮겨요.

`checked_in_at > updated_at`인 행이 KST 저장분이고, 9시간을 빼면 조건에서 빠지므로 재실행해도 안전해요.

```sql
-- 적용 전 대상 확인
SELECT COUNT(*) AS rows_to_shift,
       MIN(checked_in_at) AS earliest_kst,
       MAX(checked_in_at) AS latest_kst
FROM reservation
WHERE checked_in_at IS NOT NULL
  AND checked_in_at > updated_at;

-- 새 백엔드 전환 직후 적용
UPDATE reservation
SET checked_in_at = checked_in_at - INTERVAL 9 HOUR
WHERE checked_in_at IS NOT NULL
  AND checked_in_at > updated_at;

-- 확실한 모순 행이 모두 정리됐는지 확인
SELECT COUNT(*) AS remaining_rows
FROM reservation
WHERE checked_in_at IS NOT NULL
  AND checked_in_at > updated_at;
```

## 6. 채팅 사진 컬럼

기존 `chat_message`에 nullable 컬럼 5개를 추가해요. 적용 전 `SHOW CREATE TABLE`로 기존 타입·기본값을 확인해요.

| 컬럼 | 타입 | 기본값 |
|---|---|---|
| `image_key` | VARCHAR(512) | NULL |
| `image_content_type` | VARCHAR(40) | NULL |
| `image_width` / `image_height` / `image_bytes` | INT | NULL |

- 기존 텍스트는 NULL 유지, 사진 메시지의 빈 캡션은 빈 문자열이에요. `content` NOT NULL은 그대로예요.
- `uk_chat_message_idempotency`와 기존 room index를 유지해요.
- 사진 복구에는 DB와 함께 이미지 S3 객체와 암호화 키가 필요해요.

## 7. 채팅 숨김·신고 증거·90일 파기

컬럼/테이블은 [채팅 계약](chat-controls.md)과 대조해요. `chat_report_evidence`와 감사 원장에는 메시지 삭제 cascade를 두지 않아요.

```sql
ALTER TABLE chat_room ADD COLUMN member_hidden_at DATETIME(6) NULL,
  ADD COLUMN owner_hidden_at DATETIME(6) NULL, ADD COLUMN owner_hidden_by_member_id BIGINT NULL;
ALTER TABLE chat_message ADD COLUMN purged_at DATETIME(6) NULL,
  ADD INDEX idx_chat_message_retention (purged_at, created_at, id);
ALTER TABLE chat_report ADD COLUMN evidence_captured_at DATETIME(6) NULL;
CREATE TABLE chat_report_evidence (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id BIGINT NOT NULL, message_id BIGINT NOT NULL, room_id BIGINT NOT NULL,
  sender_member_id BIGINT NULL, sender_role ENUM('ADMIN','MEMBER','OWNER') NOT NULL,
  content TEXT NOT NULL, image_key VARCHAR(512) NULL, image_content_type VARCHAR(40) NULL,
  image_width INT NULL, image_height INT NULL, message_created_at DATETIME(6) NULL,
  retracted_at_capture BIT(1) NOT NULL, captured_at DATETIME(6) NOT NULL,
  UNIQUE KEY uk_chat_evidence_report_message (report_id,message_id),
  KEY idx_chat_evidence_image (image_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE chat_report_access_audit (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, report_id BIGINT NOT NULL,
  admin_member_id BIGINT NOT NULL, message_id BIGINT NULL,
  action ENUM('CONTEXT','IMAGE') NOT NULL, purpose VARCHAR(40) NOT NULL,
  accessed_at DATETIME(6) NOT NULL, KEY idx_chat_audit_report_time (report_id,accessed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- 실행 전 `SHOW CREATE TABLE`로 컬럼·인덱스 존재 여부를 확인해요.
- 파기 worker는 `CHAT_RETENTION_ENABLED`로 켜요(기본 `false`).
