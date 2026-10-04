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

현재 운영 앱은 `reserve_app`과 `ddl-auto: validate`를 사용해요. 승인된 DDL은
`reserve_ddl` 계정으로만 적용하며, 역할의 보호된 보관본은 `/etc/reserve-db-roles.json`이에요.
접속:
```bash
(
  set -eu
  MYSQL_IP=$(sudo docker inspect mysql --format '{{(index .NetworkSettings.Networks "app-network").IPAddress}}')
  test -n "$MYSQL_IP"
  # 비밀번호는 MySQL의 숨김 입력창에 직접 입력한다. 명령 인자나 출력에 넣지 않는다.
  sudo docker exec -it mysql mysql --protocol=TCP --host="$MYSQL_IP" --user=reserve_ddl --password reserve
)
```

## 1. 가게 검색 FULLTEXT 인덱스 (ngram)

가게 검색에서 FULLTEXT로 후보를 좁히되 기존 LIKE 검색 결과·필터·정렬을 유지해요.
동등성 확인용 LIKE count도 실행하므로 전체 검색의 속도 향상을 보장하지 않아요.

### DDL

```sql
-- ① ngram 파서 확인 (한글은 단어 경계가 없어 기본 파서로는 색인되지 않는다)
SHOW VARIABLES LIKE 'ngram_token_size';        -- 현재 후보 구현은 2일 때만 FULLTEXT를 사용한다.

-- ② 인덱스 생성
--    MATCH() 대상 컬럼 목록과 FULLTEXT 인덱스 정의가 일치해야 한다.
--    StoreSearchSpecification.withFulltextCandidate 의 MATCH 대상과 함께 관리한다.
ALTER TABLE store
  ADD FULLTEXT INDEX ft_store_search (store_name, description, address, category, keywords)
  WITH PARSER ngram;

-- ③ 확인
SHOW INDEX FROM store WHERE Index_type = 'FULLTEXT';
SHOW CREATE TABLE store;                       -- 다섯 컬럼과 WITH PARSER ngram 확인
```

### 적용 후 자동 선택과 폴백

현재 구현의 `search.store.fulltext-enabled` 기본값은 `true`예요. 명시적으로 `false`를 지정하면
탐지 없이 LIKE를 사용해요. `true`여도 무조건 MATCH를 실행하지 않아요.

- `StoreFulltextSearch`가 MySQL, `ngram_token_size=2`, MATCH 대상 다섯 컬럼의 정확한
  FULLTEXT 인덱스와 `WITH PARSER ngram`을 처음 한 번 확인해요.
- H2·인덱스 미설치·파서/토큰 크기 불일치·탐지 실패는 LIKE로 처리하고 탐지를 반복하지 않아요.
- 사용 불가 판정을 캐시하므로 실행 중 인덱스를 설치했으면 새 앱 기동으로 다시 확인해요.
  인덱스는 승인된 `reserve_ddl` 계정으로 설치하고, 설정 주석을 푸는 별도 작업은 필요하지 않아요.

### 확인 방법

```sql
-- 인덱스 접근 확인용. 앱의 원문 LIKE·count·정렬 동등성을 증명하는 쿼리는 아니다.
EXPLAIN SELECT * FROM store
 WHERE MATCH(store_name, description, address, category, keywords)
       AGAINST('+"강남"' IN BOOLEAN MODE);
```

### 검색 코드 규칙

- FULLTEXT 후보는 원문에 있는 연속 두 글자의 문자·숫자로 만들어요. 한글 두 글자를 우선하고,
  연산자나 여러 단어를 새 검색 의미로 해석하지 않아요. 두 글자 후보가 없는 짧은 문자·기호 검색은 LIKE예요.
- `StoreSearchSpecification.withFulltextCandidate`는 기존 공개 Specification에 MATCH를 **AND**해요.
  원문 LIKE의 연속 문구와 `%`·`_`·escape 문자 그대로의 검색 조건을 함께 유지해요.
- LIKE와 후보 모두 `deleted_at IS NULL AND status = 'ACTIVE'`, 분야·지역·거리 후보를 공유해요.
  유효 배지 우선과 별점·리뷰·최신·추천·거리순을 DB 전체 정렬 후 페이지로 반환하며,
  동점은 `store_id DESC`로 고정해요. 분야·지역이 있는 검색도 같은 후보 경로를 사용할 수 있어요.
- 거리순은 1,000km bounding-box 좌표 후보만 DB에서 고르고, cosine 내림차순·`store_id DESC`로 정렬해요.
- 독립 `REPEATABLE_READ` 읽기 트랜잭션에서 원문 LIKE count와 후보 페이지의 전체 개수를 비교해요.
  후보는 LIKE 결과의 부분집합이므로 개수가 같을 때만 후보 페이지를 사용해요.
  불용어·콜레이션 등의 차이로 누락되면 같은 스냅샷의 LIKE 페이지로 돌아가요.
- MATCH 실행 오류는 독립 트랜잭션 종료 후 LIKE로 폴백하고, 해당 앱 실행 중 FULLTEXT를 비활성화해
  반복 오류를 막아요. 응답 DTO도 독립 트랜잭션 안에서 변환해요.

참고 문서: [MySQL FULLTEXT 제한](https://dev.mysql.com/doc/refman/8.0/en/fulltext-restrictions.html),
[ngram 파서](https://dev.mysql.com/doc/refman/8.0/en/fulltext-search-ngram.html).

### 2026-10-02 격리 MySQL 8.0.45 검증

H2에서는 LIKE·분야·지역·추천·거리 후보/정렬·205건 페이지 경계를 확인했고, FULLTEXT는 Mockito로 호출 계약을 확인했다.
2026-10-02에는 네트워크·포트가 없는 격리 **MySQL 8.0.45 / ngram_token_size=2**에서 합성 215행으로
당시 StoreRepository의 순수 MATCH 내용/count SQL을 실행했다. LIKE는 당시 Specification의 조건·정렬을 SQL로 재현했다.
사진·공방 단일 검색어 × 최신·리뷰·별점순 6조합에서 삭제/정지 제외, 유효 배지 우선, 동점 ID 내림차순,
20행씩 깊은 페이지의 중복·누락·count를 대조했다. `EXPLAIN`의 `fulltext / ft_store_search`와
`EXPLAIN ANALYZE` 실행, MATCH 컬럼 불일치의 1191 오류도 확인했다.

**당시 순수 MATCH의 전체 검색 결과 동등성은 성립하지 않았다.** `강남 사진`은 LIKE의 연속 문구 1행과 달리
FULLTEXT가 순서 반전·서로 다른 컬럼의 단어까지 3행을 반환했고, `100%`도 LIKE 1행 / FULLTEXT 3행이었다.
이 결과로 당시 `search.store.fulltext-enabled=false`를 유지하고 활성화를 보류했다.
당시 운영 DDL은 실행하지 않았다. 격리 데이터와 컨테이너는 검증 후 제거했다.

같은 격리 엔진에서 경쟁 행 잠금의 1205 오류, deadlock의 단일 1213 victim과 양쪽 rollback을 확인했다.
ALTER TABLE은 앞선 DML까지 암묵적으로 commit하므로 ROLLBACK으로 되돌릴 수 없다는 점도 실증했다.
DDL 변경의 복구에는 별도의 역방향 DDL·복원 절차가 필요하다.

### 2026-10-04 후보 방식 구현과 운영 인덱스 적용

통합 구현은 위 순수 MATCH 대체 방식을 사용하지 않는다. 후보 MATCH에 원문 LIKE를 함께 적용하고,
같은 읽기 스냅샷의 count가 다르면 LIKE로 돌아가도록 검색 관문을 변경했다.
다중 단어·기호의 기존 검색 의미를 유지하는 방식이며, 10/2 실험의 결과 차이를 없었던 일로 보지 않는다.

운영 DDL 직전 `ngram_token_size=2`, InnoDB, `store` 3행과 FULLTEXT 인덱스 미설치를 확인했다.
제한된 `reserve_app` 계정으로 원래 테이블 구조·행을 백업하고, 승인된 `reserve_ddl` 계정으로
`ft_store_search (store_name, description, address, category, keywords) WITH PARSER ngram`을 생성했다.
백업은 `/var/backups/reserve-manual/store-fulltext-20261003T173057Z/store.sql`에 보존한다
(6,904바이트, root 소유, 파일 권한 600). 백업 원문은 문서나 실행 로그에 출력하지 않는다.

| 적용 시각 | 변경 | 확인 결과 |
|---|---|---|
| 2026-10-04 02:30:57 KST 전후 (UTC 2026-10-03 17:30:57) | `reserve_ddl`로 다섯 컬럼의 `ft_store_search` ngram FULLTEXT 생성 | 정확한 다섯 컬럼의 FULLTEXT 인덱스 확인, 기존 3행 유지, MATCH 실행 성공(해당 조회 0행) |

2026-10-04 v2.8.6(main `3199e48fb9aa6f8c5204c946ec2382487f4c22a0`)의 blue 앱으로 후보 검색을 배포했다.
앱 계정 `reserve_app`에서 ngram 크기 2·다섯 컬럼 FULLTEXT와 MATCH 실행을 확인했다.
원문 LIKE·MATCH+LIKE·공개 API v1의 검색 표본은 모두 2행이었고, 새 앱의 FULLTEXT 폴백 경고는 없었다.
앱의 `validate` 모드는 유지하며, 실행 이력은 [배포 런북](deployments.md#2-3-v286-배포-확인-2026-10-04)에 기록한다.


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

## 8. 비밀번호 재설정 코드 해시 (컬럼 적용, 새 앱 배포 전)

새 코드는 BCrypt 해시를 `password_reset_token.token_hash VARCHAR(60) NULL`에 저장한다.
기존 `token VARCHAR(10) NOT NULL`은 유지하며 새 행에는 코드 대신 `HASHED`를 기록한다.
`token_hash IS NULL`인 기존 6자리 코드는 원래의 5분 만료·실패 상한을 그대로 적용한다.
평문 코드를 일괄 조회하거나 백필하지 않는다.

```sql
-- 배포 전 실제 타입·컬럼 존재 여부를 읽기 전용으로 확인한다.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'password_reset_token'
  AND COLUMN_NAME IN ('token', 'token_hash');

-- 컬럼이 없을 때만 승인된 DDL 계정으로 실행한다. 재실행하지 않는다.
SET SESSION lock_wait_timeout = 5;
ALTER TABLE password_reset_token ADD COLUMN token_hash VARCHAR(60) NULL, ALGORITHM=INSTANT;
```

현재 운영은 최소 권한 앱 계정과 `ddl-auto: validate`를 사용하므로 이 컬럼을 자동 생성하지 않는다.
2026-10-02 새 후보 JAR의 읽기 전용 검증에서 실제 운영의 `token_hash` 누락을 확인했다.
2026-10-03 승인 범위에서 DDL 계정으로 nullable 컬럼 하나를 `ALGORITHM=INSTANT`로 추가했다.
변경 전 테이블 정의와 단일 테이블 gzip 덤프는
`/var/backups/reserve-scripts/20261003-before-token-hash/`에 보존했다(디렉터리 700, 파일 600).
기존 1행의 원래 컬럼 집계 해시는 전후 같고 새 컬럼은 `VARCHAR(60) NULL`이다.
10/2 후보와 10/3 `01ce08e` 후보의 엔티티 33개가 제한된 `reserve_app` 계정으로 읽기 전용 스키마 검증을 통과했다.
10/3 검증 JAR의 SHA-256은 `f995cc530fea75dd90caae4da3558a9f0d3d97705d7f949145910563ac78152b`이며,
같은 운영 이미지의 별도 컨테이너에서 메모리 256 MiB·접속 풀 1개로 확인했다.
검증은 Spring·스케줄러·외부 연동을 기동하지 않았다. 기존 운영 앱의 Actuator JSON도 `status=UP`이었다.

## 9. 사진 원래 이름과 신고 보존 분류 (준비, 운영 미적용)

적용 대상은 채팅 메시지·신고 증거·신고·접근 원장 네 테이블이에요. 먼저 테이블 정의·컬럼·인덱스와 행 수를 읽고, 승인된 DDL 계정으로 원본 덤프를 보호된 서버 경로에 보존해요. 아래는 해당 컬럼·인덱스가 없을 때만 적용하며 재실행하지 않아요.

```sql
SET SESSION lock_wait_timeout = 5;
ALTER TABLE chat_message
  ADD COLUMN image_original_filename VARCHAR(255) NULL;
ALTER TABLE chat_report_evidence
  ADD COLUMN image_original_filename VARCHAR(255) NULL;
ALTER TABLE chat_report
  ADD COLUMN retention_category VARCHAR(30) NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN retention_hold BIT(1) NOT NULL DEFAULT b'0',
  ADD COLUMN retention_basis_at DATETIME(6) NULL,
  ADD COLUMN minimum_retention_until DATETIME(6) NULL,
  ADD COLUMN retention_note VARCHAR(500) NULL,
  ADD COLUMN retention_changed_by_member_id BIGINT NULL,
  ADD COLUMN retention_changed_at DATETIME(6) NULL,
  ADD INDEX idx_chat_report_retention
    (retention_category,retention_hold,status,reviewed_at,id),
  ADD INDEX idx_chat_report_contract_retention
    (retention_category,retention_hold,status,retention_basis_at,id);
ALTER TABLE chat_report_access_audit
  MODIFY COLUMN action ENUM('CONTEXT','IMAGE','RETENTION_CHANGE') NOT NULL,
  ADD INDEX idx_chat_audit_retention (accessed_at,id);
```

- 기존 신고는 `UNCLASSIFIED`로 보존해요. 파일명·기산일·처리일·고지일을 추측하여 백필하지 않아요.
- `retention_category`는 엔티티도 명시적인 JDBC VARCHAR 매핑이에요. `retention_hold`는 Hibernate boolean과 맞는 `BIT(1)`을 써요.
- 새 JAR는 제한된 앱 계정과 `ddl-auto: validate`로 검증해요. 타입 차이를 `update`나 root 앱 계정으로 우회하지 않아요.
- 복구 시 새 파기 스위치를 끄고 기존 이미지를 재기동해요. 추가 컬럼·테이블과 감사 enum 확장은 남겨 기존·신규 데이터를 보존해요. 컬럼 제거로 되돌리지 않아요.
- 새 개인정보처리방침·채팅 고지를 실제 운영에서 확인한 뒤 그 게시 시각을 `CHAT_RETENTION_NOTICE_PUBLISHED_AT`에 offset 포함 ISO-8601로 등록해요. `CHAT_RETENTION_ENABLED=true`여도 30일 전에는 파기하지 않아요. 접근 기록은 `CHAT_RETENTION_ACCESS_AUDIT_YEARS=1` 또는 법령상 `2`를 써요.
- 이 DDL은 예약·결제·환불·광고 원장을 변경하거나 기간 파기를 활성화하지 않아요.

## 10. 직원 웨이팅 접수 (준비, 운영 미적용)

가게별 접수번호와 재시도 키를 DB unique로 보호해요. 가게 잠금과 실제 소유권 검사는 서비스에서 함께 적용하며 기존 Store/Member의 역방향 의존을 추가하지 않아요.

```sql
CREATE TABLE waiting_entry (
  waiting_entry_id BIGINT NOT NULL AUTO_INCREMENT,
  store_id BIGINT NOT NULL,
  business_date DATE NOT NULL,
  entry_number INT NOT NULL,
  display_name VARCHAR(40) NULL,
  party_size INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  client_request_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  called_at DATETIME(6) NULL,
  finished_at DATETIME(6) NULL,
  PRIMARY KEY (waiting_entry_id),
  UNIQUE KEY uk_waiting_store_number (store_id,business_date,entry_number),
  UNIQUE KEY uk_waiting_store_request (store_id,client_request_id),
  KEY idx_waiting_board (store_id,status,business_date,entry_number),
  KEY idx_waiting_finished (status,finished_at),
  CONSTRAINT chk_waiting_party_size CHECK (party_size BETWEEN 1 AND 100),
  CONSTRAINT chk_waiting_entry_number CHECK (entry_number > 0),
  CONSTRAINT chk_waiting_status CHECK (status IN ('WAITING','CALLED','SEATED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- 업무 날짜는 KST, 접수·호출·종료 타임스탬프는 UTC `DATETIME(6)`이에요. 재시도 키는 소문자로 정규화해요.
- 새 자료의 정리는 실제 고지 게시 시각을 `WAITING_RETENTION_NOTICE_PUBLISHED_AT`에 등록한 후 실행해요. `WAITING_RETENTION_ENABLED=false`면 중지해요.
- 종료팀 표시명은 다음 KST 날짜에 제거하고 종료 기록은 7일 뒤 파기해요. 정상 가게의 진행팀은 날짜가 지나도 보존해요. 가게가 삭제되면 남은 진행팀을 취소하고 표시명을 제거해요.
- 이전 앱으로 복구해도 이 테이블은 남겨 접수 자료를 보존해요. 일반 회원용 `/waiting` 페이지는 계속 준비 중이며 이번 구현은 사업자 패널의 직원 접수 탭이에요.
현재 운영은 구버전 앱이며, 새 코드의 해시 저장은 새 앱 배포 후에 시작한다.
재발송과 재설정은 회원 잠금 다음 토큰 ID 한 행 잠금 순서를 유지한다.
실패 횟수는 예외가 나도 커밋하고, 성공 시 비밀번호·세션 세대 변경과 코드 소비를 함께 커밋한다.

2026-10-01 로컬 격리 MySQL 8.0.45에서 실제 Spring 서비스 검사 11건을 통과했고,
생성된 해시 컬럼의 `VARCHAR(60) NULL`과 테스트 행을 MySQL에서 직접 확인했다.
동시 실패 요청 8건의 카운터는 5로 멈췄으며, 동시 재설정 2건 중 하나만 성공했다.
H2 백엔드 전체 603건도 통과했다. 운영 DB에 적용한 기록은 아니다.

구버전 앱은 추가 컬럼이 있는 DB를 읽을 수 있으나 새 해시 코드의 `HASHED` 표식을 인증할 수 없다.
롤백 뒤에는 해당 사용자가 코드를 재발송해야 한다. 새 코드가 구버전에서 그대로 인증된다고
가정하지 않으며, 컬럼 삭제나 기존 토큰 타입 변경은 롤백 절차에 넣지 않는다.
