# 수동 DDL 런북

`ddl-auto: update`가 만들지 못하는 운영 DDL과 적용 절차예요.

`ddl-auto: update`는 새 컬럼 추가까지만 해요. 아래는 손으로 적용해요.

- 컬럼 **삭제**
- 컬럼 **타입 변경** (`VARCHAR(255)` → `VARCHAR(500)` 등)
- 제약 조건 변경 (NOT NULL, UNIQUE, FK)
- **FULLTEXT 인덱스**
- 인덱스 **이름 변경**


## 2026-10-18 운영 적용 상태

v2.12.0 main `b150ba5ac53fb2e2aaee1fc1f3866106615f5fbc`의 `scripts/sql/feed-v6-from-v2.sql`(15절 본문·15.1~15.8 전체)과 `scripts/sql/oauth-security-v7.sql`(16절)을 승인된 `reserve_ddl`로 실제 적용했어요. 아래 후보·운영 미적용 표시는 준비 당시의 기록이며 적용 SQL을 다시 실행하는 지시가 아니에요.

새 직전 백업의 독립 다운로드·격리 복원 뒤 적용했으며 실제 49개 테이블·49개 FK·12개 CHECK와 unique·인덱스 정의를 대조했어요. 기존 66개 행의 원래 컬럼 값과 FK 고아 0을 확인했고, 실제 최종 JAR이 `reserve_app`·`validate`로 49개 모델 검증을 통과했어요. 복원 덤프에서 명시 인덱스로 남은 `promotion.member_id`의 중복 FK 보조 인덱스는 격리 복원본에서만 제거해 운영의 동일 선두 컬럼 복합 인덱스와 대조했어요. benefit 디자인 CHECK의 latin1/utf8mb4 표기는 같은 ASCII 허용값이며 그 밖의 정의는 같아요. 운영에 이를 맞추기 위한 추가 DDL은 실행하지 않았어요. [실제 전환 기록](deployments.md#2026-10-18-v2120-실제-운영-전환)을 함께 봐요.

이후 v2.13.0 main `8c3648e6630bc1a1c82e1f36aa692d3df699b435` 전환에는 **신규 DDL을 실행하지 않았어요**. 새 직전 백업의 격리 복원에서 49테이블·68행·FK 49개 orphan 0을 확인하고 실제 최종 JAR을 DDL 권한 없는 `reserve_app`으로 49모델 `validate`했어요. 운영과 복구는 기존 v7 스키마·최신 DB·사진·키를 유지하며 아래 15·16절의 최초 적용 SQL을 다시 실행하지 않아요. [v2.13.0 전환 근거](deployments.md#2026-10-18-v2130-실제-운영-전환)를 함께 봐요.

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

2026-10-01 확인 당시에는 운영이 구버전 앱이었고, 새 해시 저장은 이후 정식 배포로 전환했다.
재발송과 재설정은 회원 잠금 다음 토큰 ID 한 행 잠금 순서를 유지한다.
실패 횟수는 예외가 나도 커밋하고, 성공 시 비밀번호·세션 세대 변경과 코드 소비를 함께 커밋한다.

2026-10-01 로컬 격리 MySQL 8.0.45에서 실제 Spring 서비스 검사 11건을 통과했고,
생성된 해시 컬럼의 `VARCHAR(60) NULL`과 테스트 행을 MySQL에서 직접 확인했다.
동시 실패 요청 8건의 카운터는 5로 멈췄으며, 동시 재설정 2건 중 하나만 성공했다.
H2 백엔드 전체 603건도 통과했다. 운영 DB에 적용한 기록은 아니다.

구버전 앱은 추가 컬럼이 있는 DB를 읽을 수 있으나 새 해시 코드의 `HASHED` 표식을 인증할 수 없다.
롤백 뒤에는 해당 사용자가 코드를 재발송해야 한다. 새 코드가 구버전에서 그대로 인증된다고
가정하지 않으며, 컬럼 삭제나 기존 토큰 타입 변경은 롤백 절차에 넣지 않는다.

## 9. 사진 원래 이름과 신고 보존 분류 (2026-10-04 적용)

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

2026-10-04 승인 후 `reserve_ddl`로 적용했어요. 네 채팅 테이블의 변경 전 덤프는
`/var/backups/reserve-scripts/20261004-chat-retention-waiting-091203Z/chat-before.sql.gz`에
보존해요(디렉터리 700, 파일 600·root 소유). 기존 컬럼 전체의 정렬된 조회 해시는 변경 전후 같아요.
DDL 적용 시 앱 계정·권한을 확대하거나 파기 스위치를 켜지는 않았어요.
이후 `WaitingEntry`를 포함한 컴파일된 모델 34개가 운영 `reserve_app`과 `validate` 대조를 통과했어요.
별도 대조는 Spring·스케줄러·외부 연동을 띄우지 않았으며 실제 릴리스 JAR 대조와 구분해요.
v2.8.7 실제 앱도 `validate`로 기동하고 health `UP`을 확인했어요.
실제 고지·유예 설정은 [배포 확인](deployments.md#2-4-v287-배포-확인-2026-10-04)과 [채팅 계약](chat-controls.md)을 따라요.

## 10. 직원 웨이팅 접수 (2026-10-04 적용)

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
- 이전 앱으로 복구해도 이 테이블은 남겨 접수 자료를 보존해요. 10절을 적용한 당시 범위는 사업자 패널의 직원 접수였고, 일반 회원의 고객 접수는 아래 11·12절과 후속 출시에서 적용했어요.

2026-10-04 위 승인과 같은 DDL 계정으로 새 테이블을 만들었어요. nullable 원래 파일명·미분류 기본값·감사 enum 확장과 함께 적용했고, 기존 데이터 삭제는 실행하지 않았어요.

## 11. 고객 웨이팅 확장 (2026-10-09 운영 DDL 적용)

11→12→13절은 2026-10-09 운영 적용을 완료했고, v2.10.0의 14절과 전체 35모델 제한 계정 validate·보존/복원 근거는 [실제 운영 적용 기록](#2026-10-09-v2100-실제-운영-적용)과 [백업 런북](backup.md)에 있어요. 아래 날짜별 미적용 조회와 격리 검증은 적용 전 기록이에요. 기존 운영에 SQL을 다시 실행하는 지시로 읽지 않으며, 새 대상에 적용하거나 복구할 때도 대상 재조회·새 백업·작업별 승인 관문을 유지해요.

직원 명단과 고객 접수는 같은 `waiting_entry`를 사용해요. 가게의 고객 접수는 기존 가게까지 `OFF`로 시작하고, 직원 접수는 계속 가능해요. 운영 적용 전 제한된 백업 경로에 `store`·`waiting_entry`를 백업하고 복원 가능 여부를 확인한 뒤 별도 DDL 계정으로 실행해요. 실제 고지 게시와 릴리스 적용 승인을 확인해야 해요.

2026-10-08 20:50:30 KST 읽기 전용 조회의 실제 대상은 Lightsail의 `mysql` 컨테이너, DB `reserve`, MySQL **8.0.45**예요. `store.waiting_intake_mode`·`waiting_paused`·`reservation_enabled`와 `waiting_entry.member_id`·`source`가 없고, 당시 대기 접수는 0행이었어요. 21:14:52 KST 추가 조회에서 `waiting_entry.privacy_notice_published_at`도 없고, 직원 접수의 기존 unique 2개와 CHECK 3개만 확인했어요. 이 조회는 DDL 적용·복원·새 앱 검증 결과가 아니며 적용 직전에 다시 읽어야 해요.

2026-10-09 02:14~02:18 KST 재조회에서도 같은 `reserve`/MySQL 8.0.45의 35테이블에 11·12·13절 추가 정의는 없었어요. 대상 행 수는 `store` 3·`waiting_entry` 0·`email_verification` 1·`member` 3이며 이메일 중복 그룹은 0이었어요. 고객 고지 변수도 아직 없어요. 이 집계는 개인정보 원문을 출력하지 않는 준비 조회이며 DDL·고지 게시·복원·새 앱 검증을 실행한 결과가 아니에요.

2026-10-09 **11:29 KST**의 운영 준비 조회에서도 MySQL 8.0.45·35테이블과 11·12·13절의 신규 컬럼·CHECK·인덱스 미적용을 확인했어요. 이메일 중복 그룹·웨이팅 행은 각각 0이고 고객 고지 변수는 미설정이에요. 실제 적용 직전에 이 상태와 남은 SQL을 다시 확정해요.

이후 같은 날 최신 정기 백업 `reserve-20261008-181001.sql.gz`를 보호된 PC 경로로 받아 **격리 MySQL 8.0.45 / 35테이블·61행**에 복원하고 별도 DDL 계정으로 11절 → 12절 → 13절을 실제 적용했어요. 원래 컬럼의 모든 값·행 digest와 기존 제약·인덱스·CHECK·FK를 보존했으며, 새 컬럼 7개·CHECK 2개·고객 목록 인덱스·이메일 unique와 중복 0을 대조했어요. 기존 `chk_waiting_status`의 문자셋 표기 변경은 허용 상태 값·강제 여부가 동일함을 확인했어요. 가입 인증의 opt-in MySQL 검사 5개도 실패·skip 없이 통과했어요. 실제 로컬 v2.9.0 JAR로 제한된 `reserve_app`의 독립 `validate`도 34모델을 통과했으며 전후 모든 데이터/메타데이터를 보존했어요. 잘못된 기본값·강제하지 않는 CHECK·틀린 인덱스의 verifier 거부 3개와 즉시 원복도 확인했어요. 이 준비 근거와 아래 실제 첫 전환을 구분하며 정확한 JAR/백업 해시·보호 경로와 합성 DB 분리 근거는 [백업 런북](backup.md)을 따라요.

**2026-10-09 15:41:38~39 KST 운영 적용:** 승인된 첫 전환에서 공개 트래픽과 구 앱의 쓰기를 닫고, 새 직전 백업 `reserve-20261009-063011.sql.gz`의 독립 S3 읽기·격리 복원·최종 원격 JAR 검증을 마친 뒤 Lightsail `mysql`의 실제 `reserve`에 `reserve_ddl`로 11절 → 12절 → 13절을 적용했어요. 35테이블·61행의 원래 값·기존 제약/인덱스 의미를 보존했고 새 컬럼 7개·강제 CHECK 2개·고객 조회 인덱스·이메일 unique·이메일 중복 0을 대조했어요. 기존 세 가게는 `OFF`·`waiting_paused=false`·`reservation_enabled=true`이며 고객 접수를 임의로 열지 않았어요. 15:44:53 KST에는 같은 최종 원격 이미지의 Java 21·제한된 `reserve_app`으로 독립 `validate` **34모델·exit 0**, 15:45:01 KST에는 실제 운영 SQL verifier **exit 0·ledger/deposit 불변식 위반 0/0**을 확인했어요. `update`나 root 앱 계정으로 우회하지 않았어요.

다음 조회는 승인된 DDL의 대상을 확정하기 위한 읽기 전용 입력이에요. 존재하는 컬럼·제약·인덱스는 새 명령에서 제외해요. CHECK의 실제 정의와 기존 자료도 `SHOW CREATE TABLE store`·`waiting_entry`로 확인해요.

```sql
SELECT DATABASE(), @@version, @@hostname;
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'store' AND COLUMN_NAME IN ('waiting_intake_mode','waiting_paused','reservation_enabled'))
    OR (TABLE_NAME = 'waiting_entry' AND COLUMN_NAME IN ('member_id','source','privacy_notice_published_at')));
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('store','waiting_entry','email_verification')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('store','waiting_entry','email_verification');
```

```sql
SET SESSION lock_wait_timeout = 5;
ALTER TABLE store
  ADD COLUMN waiting_intake_mode VARCHAR(16) NOT NULL DEFAULT 'OFF',
  ADD CONSTRAINT chk_store_waiting_intake CHECK (waiting_intake_mode IN ('OFF','ONSITE','REMOTE','BOTH'));

ALTER TABLE waiting_entry
  ADD COLUMN member_id BIGINT NULL,
  ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'STAFF',
  ADD COLUMN privacy_notice_published_at DATETIME(6) NULL,
  ADD KEY idx_waiting_member (member_id,status,created_at),
  ADD CONSTRAINT chk_waiting_source CHECK (source IN ('STAFF','ONSITE','REMOTE'));
```

- 적용 전 `information_schema.COLUMNS`·`STATISTICS`에서 대상 컬럼·인덱스 유무를 확인해요. 부분 성공 뒤에는 위 두 문장을 통째로 재실행하지 않아요.
- 적용 후 새 JAR의 `validate` 성공, 공개 가게 목록·개인 목록의 권한, 접수·호출·입장·취소와 스키마를 확인해요. `ddl-auto=update`나 root 앱 계정으로 검증 실패를 우회하지 않아요.
- 회원 연결은 FK 없이 유지하며 회원 탈퇴 이벤트의 동일 트랜잭션에서 취소·최소화해요. 새 모듈 때문에 `MemberService`가 웨이팅 저장소를 직접 주입받지 않아요.
- 고객은 접수 화면에서 해당 가게에 개인정보 제공에 동의해요. 서버가 현재 고지 버전을 대조하고, `privacy_notice_published_at`에 그 시각을 UTC로 저장해요. 회원 식별자·고지 시각을 공개 명단 응답에 추가하지 않아요.
- 실제 고객 고지 게시 시각은 **별도** `WAITING_CUSTOMER_RETENTION_NOTICE_PUBLISHED_AT`에 offset 포함 ISO-8601로 등록해요. 기존 `WAITING_RETENTION_NOTICE_PUBLISHED_AT`는 직원 접수 고지예요. 고객 값이 없거나 잘못됐거나 미래면 새 고객 접수와 고객 기간 정리를 중지해요. 직원 접수 정리는 기존 스위치·고지를 따라요.
- 고객의 종료 기록은 당일까지만 내 예약에서 확인할 수 있어요. 종료팀 이름과 회원 연결은 다음 KST 날짜에 제거하고 종료 기록은 7일 뒤 파기해요. 고객 동의 버전이 없는 기존 고객 자료에는 기간 정리를 소급 적용하지 않으며 별도 확인 대상으로 남겨요. 탈퇴 요청의 동일 트랜잭션 정리는 이 기간 정리 스위치와 별개예요.
- 앱 복구 시 새 컬럼은 남겨요. 이전 앱은 직원 접수만 지원하므로 고객 접수가 사용된 뒤에는 구버전을 단순 재가동하지 않고 고객 접수를 닫고 활성 고객 접수·QR·보존 작업의 영향부터 확인해야 해요. DB 복원은 승인·검증된 복구 절차로 진행해요.
- 고객 고지의 실제 운영 게시 시각은 `2026-10-09T06:54:37Z`이며 [실제 운영 적용 기록](#2026-10-09-v2100-실제-운영-적용)에 있어요. 기존 채팅 고지·30일 유예 시각은 바꾸지 않아요.

### 11·12절 적용 순서와 복구 경로

1. 최종 출시 범위·이미지 SHA와 대상 테이블을 확정해요. 2026-10-08 프리뷰 전체가 운영에 반영됐다고 가정하지 않아요. 이메일 인증 보완까지 포함하면 13절도 대상이에요.
2. [백업 런북](backup.md)의 보호된 사전 백업 절차로 현재 전체 DB와 대상 테이블 정의·원래 값·행 수를 보존해요. 디렉터리 700·파일 600·root 소유를 유지해요. 사전 경로는 `/var/backups/reserve-scripts/<실제-UTC시각>-before-customer-waiting-signup/`로 준비하며, 이 문서 작성만으로 파일이 생성된 것은 아니에요. 별도 접근으로 받은 백업을 격리 MySQL 8.0.45에 복원할 수 있어야 해요. 최신 정기 파일의 존재·업로드 로그만으로 이 단계를 통과시키지 않아요.
3. 실제 `SHOW CREATE TABLE`·중복 집계·인덱스 결과와 실행할 SQL, 보호된 백업 위치, 복구 이미지·설정을 함께 제시하고 **새 운영 DDL 승인**을 받아요. `reserve_ddl`로 11절 → 12절 → 포함된 경우 13절 순서로 적용해요. 각 단계의 결과를 읽고 다음 단계로 진행하며 부분 성공은 남은 항목만 작성해요. 알고리즘·메타데이터 잠금 영향은 최종 격리 DB 입력으로 확인해요.
4. 기존 컬럼의 값·행 수를 보존했는지 대조하고, 최종 릴리스 JAR을 제한된 `reserve_app`과 `ddl-auto=validate`로 확인해요. unique·CHECK·인덱스는 Hibernate 검증만 믿지 않고 실제 메타데이터를 대조해요. 외부 연동·스케줄러가 실행되지 않는 `VerifyDatabaseSchema.java` 경로를 써요. `scripts/verify-post-deploy-readonly.sh`의 `RESERVE_VERIFY_WAITING_SIGNUP_SCHEMA=1`은 11·12·13절의 컬럼·기본값·NULL, 실제 CHECK 정의와 강제 여부, 인덱스 구성과 이메일 unique·중복을 함께 확인해요. 최종 격리 MySQL에서 정상 정의와 어긋난 정의의 거부를 확인한 뒤 최신 스크립트를 설치해 사용해요. 기존 구 운영 앱에는 이 새 후보 옵션을 적용하지 않아요.
5. 고객 고지가 없는 상태에서도 새 앱은 새 고객 접수를 거부해요. 별도 게시·배포 승인 후 실제 운영 처리방침과 접수 안내를 확인하고, 새 게시 시각을 고객 변수에 등록해요. 실제 게시 전 시각을 예약 입력하거나 직원·채팅 시각을 재사용하지 않아요. `/api/waiting/retention-policy`와 실제 컨테이너 설정을 대조한 뒤 대상 가게 접수를 열어요.
6. 첫 기능 릴리스에는 이전 운영 이미지가 새 설정을 이해하지 못해 안전한 단순 롤백 대상이 없어요. 자동 배포는 새 `reserve.feature-compat=waiting-signup-v1`이 있는 복구 이미지부터 요구해요. 첫 기본 릴리스는 최종 검사와 별도 운영 승인 후 신규 쓰기를 차단한 전환 절차로 준비해요. 고객 접수를 닫은 **새 설정 호환 이미지**나 승인된 수정 이미지가 우선이며, 구 이미지에 라벨만 추가하지 않아요. 활성 고객 명단·QR 처리와 예약 차단을 유지할 수 없으면 트래픽·신규 쓰기를 닫고 복구해요. 추가 스키마와 최신 설정을 남겨요. 오래된 전체 덤프로 새 설정·접수를 덮는 복원은 별도 승인과 복원 직전 백업이 필요해요.

사용자는 10/9에 첫 전환의 신규 쓰기 제한 시간에 별도 제약이 없다고 답했고, 이후 Git 작업과 운영 백업·권한 보완·DDL 11→12→13·제한 계정 validate·실제 고지/설정 쓰기·호환 복구 준비와 배포 범위를 별도로 승인했어요. 실제 실행은 각 관문을 유지하며 위 이력과 [배포 런북](deployments.md)에 기록해요. 실결제·환불·IAM 권한 확대는 이 승인 범위에 포함하지 않아요.

## 12. 웨이팅 일시 중지와 예약 접수 선택 (2026-10-09 운영 DDL 적용)

11절의 고객 웨이팅 확장과 함께 사용하는 가게 설정이에요. `waiting_paused`는 고객 접수 방식과 별도로 새 직원·고객 접수만 중지하고 기존 명단은 보존해요. `reservation_enabled=false`인 가게는 상세의 예약 폼·가능 슬롯·직접 API 예약을 막아요. 기존 가게는 예약 켜짐·웨이팅 중지 아님으로 유지해요.

```sql
SET SESSION lock_wait_timeout = 5;
ALTER TABLE store
  ADD COLUMN waiting_paused BIT(1) NOT NULL DEFAULT b'0',
  ADD COLUMN reservation_enabled BIT(1) NOT NULL DEFAULT b'1';
```

- 승인된 운영 변경 전 `information_schema.COLUMNS`에서 이름·타입·기존 값과 11절 적용 여부를 확인하고 보호된 경로에 `store`를 백업해요. 부분 적용 뒤 위 문장을 통째로 재실행하지 않아요.
- 새 JAR은 제한된 앱 계정과 `ddl-auto=validate`로 확인해요. 운영에서 `update`로 우회하거나 이 문서만으로 운영 적용 완료를 기록하지 않아요.
- 복구 시 추가 컬럼을 삭제하지 않아요. 이전 앱은 새 예약 차단·일시 중지 설정을 알지 못하므로 이를 사용한 가게가 있으면 구버전을 바로 재가동하지 않고 신규 접수·예약 차단을 유지할 복구 경로를 먼저 확인해요.
- 질문형 등록·미리보기는 기존 최종 등록 API와 로컬 초안 저장을 사용해요. 단계 이동만으로 DB 가게·예약·결제를 만들지 않아요.

## 13. 가입 이메일 인증 증명·unique (2026-10-09 운영 DDL 적용)

2026-10-08 20:50:30 KST 운영 조회에서 `email_verification`은 기존 `id`·이메일·6자리 코드·발급/만료 시각·인증 여부·실패 횟수만 있고, 이메일 unique와 가입 증명 해시 컬럼이 없었어요. 이메일 중복 그룹 집계는 0이었어요. 이 집계를 적용 직전에 다시 확인하고 이메일 원문을 채팅·로그로 출력하지 않아요.

```sql
SELECT COUNT(*) AS duplicate_email_groups
FROM (SELECT email FROM email_verification GROUP BY email HAVING COUNT(*) > 1) duplicates;
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_verification'
  AND COLUMN_NAME IN ('email','verification_ticket_hash');

-- 중복이 없고 해당 컬럼·unique가 없을 때만 새 승인으로 실행해요.
SET SESSION lock_wait_timeout = 5;
ALTER TABLE email_verification
  ADD COLUMN verification_ticket_hash VARCHAR(64) NULL,
  ADD CONSTRAINT uk_email_verification_email UNIQUE (email);
```

- 중복이 있으면 자동 삭제나 임의 최신 행 선택으로 제약을 맞추지 않아요. 활성 인증을 보호할 정리 범위를 먼저 확정해요.
- 최종 백업에는 `email_verification`·`member`도 포함해요. 기존 인증 행의 새 해시는 NULL로 남기며 이메일만으로 가입을 허용하는 우회를 두지 않아요. 사용자는 새 화면에서 코드를 다시 발송·인증해야 해요.
- 새 프론트·백엔드는 같은 릴리스로 전환해요. 서버가 반환한 원래 5분 만료 시각을 유지하고, 가입 증명은 프론트 메모리에만 둬요. 가입 성공의 같은 트랜잭션에서 인증을 삭제하며, 회원 저장 실패 시 삭제도 롤백돼요.
- 새 설정 호환 복구 이미지에 이 인증 관문도 유지해요. 컬럼을 남긴 채 이전의 무기한·미소비 인증 동작으로 복구하지 않아요. 앱·DDL 계정 권한과 `validate`를 유지해요.

가입 인증의 H2 트랜잭션 검사와 별도로 `EmailVerificationMySqlReleaseTest`를 사용해요. 두 최초 발송의 gap lock 경합·실패 횟수 누적·동시 한 번 소비·가입 실패 롤백/원래 만료·만료되거나 잘못된 증명의 미소비를 실제 서비스와 MySQL 8.0.45에서 확인해요. `RESERVE_MYSQL_SIGNUP_TEST_ISOLATED=1`이 없으면 실행하지 않으며, URL은 `127.0.0.1:<포트>/reserve_release_signup_<구분명>`과 전용 `reserve_signup_test*` 계정만 허용해요. 합성 인증과 실제 ORM 조합이 참조하는 모델 테이블을 create-drop 하므로 새 빈 검사 DB에만 사용하고 실제 백업 복원 DB·개발/운영 DB에 연결하지 않아요. 2026-10-12 최종 로컬 후보에서 실제 8.0.45·이 격리 조건으로 **5개 실행·실패 0·스킵 0**을 확인했어요. 개인 숨김의 별도 합성 DB 검사도 제한된 DML 계정·`validate`로 **3개 실행·실패 0·스킵 0**을 확인했어요. 이 결과는 실제 운영 DDL·운영 백업의 전체 복구 근거와 구분해요.

최종 입력으로 검사를 시작할 때 전용 계정은 위 빈 DB에만 권한을 주고, URL·계정·비밀번호는 `RESERVE_MYSQL_SIGNUP_TEST_URL`·`RESERVE_MYSQL_SIGNUP_TEST_USER`·`RESERVE_MYSQL_SIGNUP_TEST_PASSWORD`로 현재 검사 프로세스에만 전달해요. 비밀번호를 명령 인수·채팅·Git 파일에 넣지 않아요. 네 환경값을 준비한 뒤 **선별한 후보의 backend 디렉터리**에서 아래 필터만 실행해요.

```powershell
./gradlew.bat test --tests 'kr.it.reserve.email.EmailVerificationMySqlReleaseTest' --rerun-tasks
```

여기서 `--rerun-tasks`는 일반 CI에서 환경값 없이 스킵했던 결과나 이전 task 상태를 실제 MySQL 검사로 재사용하지 않기 위한 옵션이에요. 대상은 위 클래스의 5개 검사이며, **실행 5·실패 0·스킵 0**과 MySQL 8.0.45 연결을 실제 결과로 확인해야 해요. 일반 CI·H2의 성공이나 환경값을 빠뜨린 스킵을 이 근거로 대신하지 않아요. 성공한 같은 입력의 MySQL 검사는 반복하지 않고, 실패 수정 후에는 바뀐 입력이 영향을 주는 실패 항목만 다시 확인해요. 종료 시 검사 프로세스의 전용 자격 환경값도 비워요.

## 14. 메시지 나에게만 삭제 (v2.10.0 운영 적용)

`chat_message_hidden`은 메시지 ID·본인 계정 ID·표시 제외 시각만 저장해요. 상대방 대화·원문·사진·신고 증거를 삭제하거나 기존 90일 보존/신고 보류 정책을 변경하지 않아요. 조회와 개인 변경 커서는 인증된 계정과 참가 가능한 방으로 한정해요. 숨긴 행도 메시지·읽음 커서의 ID는 유지하며 본문·사진은 일반 응답에 넣지 않아요. 계정 탈퇴 시 해당 계정의 표시 설정만 제거해요.

v2.9.0 범위와 구분해 새 Git·DDL·배포 승인을 받고 v2.10.0에 적용했어요. 운영 적용에는 새 출시 범위·DDL·배포 승인이 필요해요. 실제 대상 DB와 `SELECT DATABASE()`·회원/메시지 PK의 타입·아래 테이블 존재 여부를 먼저 조회하고, 직전 새 백업과 격리 복원 근거를 확보해요. 기존 테이블이 있으면 `IF NOT EXISTS`로 차이를 숨기지 않고 컬럼·unique·FK·인덱스가 같은지 확인해요.

```sql
SELECT DATABASE(), @@hostname;
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_message_hidden';
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('chat_message', 'member') AND COLUMN_KEY = 'PRI';

-- 테이블이 없고 새 승인 범위에 포함된 대상에서만 DDL 계정으로 실행해요.
CREATE TABLE chat_message_hidden (
  id BIGINT NOT NULL AUTO_INCREMENT,
  message_id BIGINT NOT NULL,
  member_id BIGINT NOT NULL,
  hidden_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_chat_hidden_viewer UNIQUE (message_id, member_id),
  INDEX idx_chat_hidden_poll (member_id, id),
  CONSTRAINT fk_chat_hidden_message FOREIGN KEY (message_id) REFERENCES chat_message(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_hidden_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE CASCADE
) ENGINE=InnoDB;

SHOW CREATE TABLE chat_message_hidden;
SHOW INDEX FROM chat_message_hidden;
```

새 테이블을 만든 뒤 제한된 앱 계정의 `ddl-auto=validate`로 새 JAR을 확인하고, 개인 삭제를 이해하는 백엔드·프론트·환경 설정·백업을 같은 복구 세트로 보관한 후 전환해요. 방 잠금과 unique가 재시도를 한 행으로 만들고, 다른 계정의 숨김 이벤트는 폴링으로 노출하지 않아요. 본인/상대/비참가자·다른 방·사진 조회·원문 신고·폴링/이전 페이지·탈퇴 경계를 최종 입력 검사에 포함해요.

복구 시 테이블이나 표시 설정을 제거하지 않아요. v2.9.0 이미지에는 개인 삭제 관문이 없으므로, 실제 개인 삭제가 사용된 이후 그 이미지만 다시 띄우면 지웠던 내용이 본인에게 다시 보일 수 있어요. 이 절의 동작을 유지하는 새 호환 복구 이미지가 필요하며, v2.9.0의 복구 묶음을 이 근거로 재사용하지 않아요.

v2.10.0 이후 자동 배포는 `reserve.feature-compat=waiting-signup-hidden-v2`를 live와 target 양쪽에 요구해요. Docker 빌드는 실제 JAR의 개인 삭제 entity·repository·service 포함 여부를 확인한 뒤에만 완료되며, 코드와 계정별 조회·사진·폴링 동작 검사를 통과한 이미지에 이 표식을 붙여요. 운영의 v2.9.0 이미지를 재표시하지 않고, 별도 승인된 첫 전환에서 새 호환 이미지·프론트·현재 환경값·백업을 확보해야 해요.

2026-10-09 격리 MySQL 8.0.45에서 복원본의 **스키마만** 별도 빈 합성 DB로 복사한 뒤 이 절의 SQL을 적용했어요. 초기 회원 FK의 `member(id)` 오류를 실제 `member(member_id)`로 수정했고, 채팅·회원 모델을 DDL 권한 없는 전용 계정의 `validate`로 확인했어요. `ChatMessageVisibilityMySqlReleaseTest`의 중복 동시 삭제·개인 커서 커밋 순서·트랜잭션 롤백 **3개가 실패 0·스킵 0**으로 통과했어요. 기존 복원 DB는 변경하지 않았고, 새 합성 DB와 전용 검사 계정만 종료 후 제거했어요. 이 결과는 운영 DDL·전체 새 JAR/복구 이미지 검증이나 실제 고객 메시지 삭제를 실행했다는 뜻이 아니에요.

### 2026-10-09 v2.10.0 실제 운영 적용

새 승인 범위에서 Lightsail의 `reserve` / MySQL 8.0.45와 실제 PK `chat_message.id`·`member.member_id`를 재조회했어요. 공개 화면·API·로그인 콜백을 503으로 닫고 앱 writer 0을 확인한 뒤 새 백업을 만들었으며, 독립 S3 다운로드와 로컬 격리 복원·이 절의 정확한 SQL·전체 새 JAR 검증을 먼저 통과했어요.

운영 `reserve_ddl`의 14절 적용은 **18:31:36 KST**, 제한된 `reserve_app`의 전체 새 JAR `validate`는 **18:31:50 KST·35모델**이에요. 35→36테이블이고 기존 61행의 전체 값 digest와 기존 컬럼·제약·인덱스·FK 메타데이터가 동일해요. 새 unique·개인 커서 인덱스·두 CASCADE FK를 격리 적용본과 대조했고 신규 표시 설정은 0행이에요. 앱의 DDL 권한을 추가하거나 `update`로 우회하지 않았어요.

실제 배포 JAR은 **87,341,762바이트·SHA-256 `85f4e311f420ecf6b3a4134976167d3807dc7b7bc20bb1d5aa89db43a7de4d19`**이고, 원본 클래스 564개와 라이브러리 136개의 바이트로 격리/운영 검증을 수행했어요. 같은 SHA의 store-shell HTML과 프론트를 대조한 새 호환 blue로 **18:40:44 KST**에 공개 전환했어요. 익명 개인 삭제 요청은 401로 거부됐고 실제 고객 메시지 삭제·실결제·환불은 실행하지 않았어요.

사전/사후 백업과 새 호환 이미지·프론트·현재 설정의 보호 보관, 사후 36테이블 백업의 별도 격리 복원은 [백업 런북](backup.md)을 따라요. 고객 고지 `2026-10-09T06:54:37Z`, 직원 접수·채팅 고지와 유예, 가게 접수·예약 설정, 메시지 원문·신고 증거를 유지했어요.

## 15. SNS 피드 (로컬 구현, 운영 미적용)

피드 후보의 DDL 범위는 15절 본문과 15.1~15.8 전체예요. 2026-10-16 전체 소스에는 [16절](#16-oauth-토큰-보호와-공급자-보안-사건-후보-운영-미적용)의 OAuth 스키마도 추가되어 현재 호환 표식은 `waiting-signup-hidden-feed-oauth-v7`예요. 초기 범위·검사 수·v3/v4/v5/v6 표식은 해당 날짜의 기록이에요. 최종 DDL은 실제 운영에 없는 정의만 의존 순서대로 선별하고, 댓글 확장·`promotion.benefit_design`·별도 피드 사진과 OAuth 변경까지 새 전체 JAR로 확인해요. 피드 게시와 혜택 승인은 별도 공개 정책이며, 댓글 알림은 후보 구현이에요. 저장·팔로우·영상·AI는 후속 범위로 남아요.

2026-10-15 조회한 운영의 v2 구조와 같은 정기 백업에서 [feed-v6-from-v2.sql](../../scripts/sql/feed-v6-from-v2.sql)을 선별했어요. 15절에 이미 포함된 15.1의 승인 컬럼·신규 신고 revision과 후속 절의 중복 ALTER를 제외하고 15.6~15.8을 포함해요. MySQL 8.0.45·DB `reserve`·피드 테이블/신규 컬럼이 없는 시작 상태를 검사하며, **`--force` 없는 mysql CLI**에서 사전 검사가 실패하면 DDL 전에 중단해요. GUI의 오류 후 계속 실행이나 일부 적용 DB에 대한 재실행에는 사용하지 않아요. 각 절의 SQL을 이 파일 뒤에 다시 붙이지 않아요.

같은 버전의 네트워크 없는 격리 복원본에 제한된 DDL 계정으로 적용했고, 36→47테이블과 기존 67행·원래 컬럼/제약/인덱스/CHECK/FK 보존, 신규 CHECK 거부·기본값·DDL 계정 DML 거부·재실행의 사전 차단을 확인했어요. 상세 입력과 해시는 [백업 준비 기록](backup.md#2026-10-15-준비용-정기-백업-독립-다운로드격리-복원)을 따라요. **운영에는 적용하지 않았으며 최종 후보 JAR 검증·새 직전 백업과 운영 DDL 승인은 별도예요.** 이후 스키마나 후보가 달라지면 이 파일을 자동 재사용하지 않고 차이를 다시 선별해요.

2026-10-11의 피드는 모든 로그인 회원이 별도 공개 닉네임으로 글·사진을 게시하는 로컬 구현이에요. 예약 인증 리뷰·채팅과 구분하며, 당시 좋아요·저장·팔로우·댓글·영상·AI는 최초 범위에 없었어요. 10/12에 승인한 좋아요·댓글·답글·신고는 15.2절의 후속 후보이며 저장·팔로우·알림·영상·AI는 계속 후속으로 남겨요. 사업자 가게 소식은 혜택과 피드가 같은 `promotion` 원문을 읽어요. 소식 작성·수정·임시저장·최대 6장 사진·미리보기·내 소식과 NEWS/NOTICE/EVENT/BENEFIT 분류, 행사·혜택의 기간·조건을 포함해요. 피드에도 게시가 기본이며 소식별로 끌 수 있어요. 별도 SNS 자유글에 소식 링크를 붙이는 동작은 원문을 복제하지 않고, 소식 삭제 때 해당 자유글의 연결만 제외해요. 10/12에는 승인된 로컬 키·사진 저장소·새 JAR 연결과 배포 준비 검사를 진행했어요. 이 절의 운영 DDL·운영 키/환경 설정·배포는 적용하지 않았어요.

`FEED_ENABLED`는 기본 `false`예요. 비활성 설정 조회는 새 테이블을 읽지 않으며 다른 피드 API는 닫혀 있어요. 이미 삭제한 글·미첨부 사진·처리 완료 신고의 기간 파기와 회원 탈퇴 정리는 기능 플래그와 무관하게 계속 적용해요. 탈퇴의 동일 트랜잭션에서 공개 프로필을 숨기고 닉네임을 `탈퇴한 회원`으로 익명화하며 unique 키는 공개 UUID 기반 탈퇴값으로 바꿔 기존 닉네임을 해제해요. 소개·계정 아바타 사용을 지우고 글의 삭제 시각을 남기되 신고 당시의 별도 스냅샷은 변경하지 않아요. **최초 entity 6개와 15.2절의 추가 entity 3개는 기능을 꺼도 새 JAR의 전체 `ddl-auto=validate` 대상이에요.** 따라서 기능 플래그만 끄고 기존 35모델 검증 결과를 새 JAR에 재사용하거나 운영 기동이 가능하다고 판단하지 않아요. 새 후보 JAR 전체의 모델 수·DDL 대조·제한된 앱 계정 검증과 복구 묶음을 별도로 확인해야 해요.

사진은 별도 `FEED_IMAGE_ENCRYPTION_KEY`의 32바이트 Base64 키로 AES-GCM 암호화하며, JWT·채팅·AWS 키로 폴백하지 않아요. 키가 없으면 텍스트 기능만 사용할 수 있고 사진 업로드·읽기는 닫혀요. 키 값은 채팅·Git·명령 인수에 남기지 않으며 생성·환경 적용은 별도 승인 대상이에요. S3는 `users/{memberId}/feed/images/*.bin` 아래 암호문만 받아요. 공개 API가 현재 게시 상태를 검사한 뒤 `no-store`로 사진을 반환하며 공개 CDN 평문 URL·presigned URL을 제공하지 않아요. 원본 EXIF·위치·텍스트 메타데이터를 복사하지 않고 JPEG 방향만 픽셀에 적용해요. PNG는 투명도 유지 PNG, JPEG/GIF는 첫 프레임 JPEG로 재인코딩해요. 입력은 한 요청에 한 장·7MiB, 게시물은 6장이며 기존 multipart 요청 한도 8MB를 늘리지 않아요.

닉네임은 NFKC·소문자로 정규화한 별도 unique 키를 사용해요. 공개 프로필은 계정 이름·이메일 대신 별도 닉네임을 표시하고 식별 필드는 UUID를 사용해요. 기존 계정 아바타도 `useAccountAvatar=true`를 직접 선택한 뒤 유효한 관리/허용 출처만 노출해요. 선택한 기존 사진 URL의 관리 경로에는 내부 회원 번호가 포함될 수 있으므로 URL까지 익명화한 것으로 표현하지 않아요. 초안·내 글은 본인만 읽으며 글 revision과 작성 요청 UUID의 unique가 편집 충돌·같은 생성 요청 재시도를 제어해요. 초안은 첫 게시 시각으로 최신순에 들어가며 공개 글의 일반 수정은 그 시각을 바꾸지 않아요.

일반 사진 읽기는 공개 글·승인된 혜택 또는 작성자 본인으로 한정해요. 피드 노출을 끈 승인된 혜택의 사진도 읽을 수 있어요. 관리자는 일반 경로로 타인의 초안·미첨부 사진을 읽지 않으며, 신고 증거 또는 제출된 혜택 신청의 전용 경로로만 열람하고 감사를 남겨요. 신고 목록은 `OPEN`/`RESOLVED`로 필터링할 수 있고, 신고 스냅샷의 `post.state`는 변경하지 않아요. 별도 `postState`가 현재 원문 상태를 표시하며 파기된 원문은 `PURGED`예요. 신고 상세는 500자, 관리자 처리 메모는 1000자로 제한해요.

아래는 **아직 적용하지 않은 후보 DDL**이에요. 대상 DB·기존 테이블·회원/가게/혜택 PK와 타입을 먼저 읽고 직전 새 백업의 독립 S3 읽기·격리 복원을 확보한 뒤, 새 승인 범위에 포함된 대상에만 DDL 계정으로 적용해요. 기존 같은 이름의 테이블이 있으면 `IF NOT EXISTS`로 덮지 않고 정확한 차이를 대조해요. 기존 계정·예약·결제·웨이팅·채팅 테이블을 수정하거나 원본을 지우지 않아요. 기존 `promotion`에는 아래의 소식 메타데이터·상태·revision을 추가하며 기존 행의 정본은 NEWS/PUBLISHED, 피드 노출 false로 유지하되 혜택 승인은 NONE으로 추가해요. 기존 소식을 자동 승인하거나 피드에 자동 게시하지 않으며 새 혜택 목록에는 심사를 통과한 항목만 포함해요. 제목·본문·업종 category·기존 PK와 `/benefits/{id}` 주소를 변환하거나 기존 소식을 피드에 자동 게시하지 않아요.

```sql
SELECT DATABASE(), @@hostname;
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
  ('feed_profile','feed_post','feed_media','feed_report','feed_report_image','feed_audit_record');
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('member','store','promotion') AND COLUMN_KEY = 'PRI';
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion';

ALTER TABLE promotion
  ADD COLUMN news_type VARCHAR(16) NOT NULL DEFAULT 'NEWS',
  ADD COLUMN state VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN starts_at DATETIME(6),
  ADD COLUMN ends_at DATETIME(6),
  ADD COLUMN conditions VARCHAR(1000),
  ADD COLUMN feed_enabled BIT(1) NOT NULL DEFAULT b'0',
  ADD COLUMN benefit_state VARCHAR(16) NOT NULL DEFAULT 'NONE',
  ADD COLUMN benefit_requested_at DATETIME(6),
  ADD COLUMN benefit_reviewed_at DATETIME(6),
  ADD COLUMN benefit_reviewer_id BIGINT,
  ADD COLUMN benefit_review_note VARCHAR(1000),
  ADD COLUMN revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN deleted_at DATETIME(6),
  ADD INDEX ix_promotion_news_public (state,news_type,ends_at,created_at,promotion_id),
  ADD INDEX ix_promotion_news_author (member_id,state,created_at,promotion_id),
  ADD INDEX ix_promotion_news_deleted (state,deleted_at,promotion_id),
  ADD INDEX ix_promotion_benefit_review (benefit_state,benefit_requested_at,promotion_id);

CREATE TABLE feed_profile (
  profile_id BIGINT NOT NULL AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  public_id VARCHAR(36) NOT NULL,
  nickname VARCHAR(30) NOT NULL,
  nickname_key VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  bio VARCHAR(160),
  use_account_avatar BIT(1) NOT NULL,
  hidden BIT(1) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (profile_id),
  CONSTRAINT uk_feed_profile_member UNIQUE (member_id),
  CONSTRAINT uk_feed_profile_public UNIQUE (public_id),
  CONSTRAINT uk_feed_profile_nickname UNIQUE (nickname_key),
  CONSTRAINT fk_feed_profile_member FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_post (
  post_id BIGINT NOT NULL AUTO_INCREMENT,
  profile_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  region VARCHAR(50),
  store_id BIGINT,
  promotion_id BIGINT,
  news_promotion_id BIGINT,
  state VARCHAR(16) NOT NULL,
  revision BIGINT NOT NULL,
  client_request_id VARCHAR(36),
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  deleted_at DATETIME(6),
  PRIMARY KEY (post_id),
  CONSTRAINT uk_feed_post_request UNIQUE (profile_id,client_request_id),
  CONSTRAINT uk_feed_post_news UNIQUE (news_promotion_id),
  INDEX ix_feed_post_public (state,created_at,post_id),
  INDEX ix_feed_post_region (region,state,created_at,post_id),
  INDEX ix_feed_post_author (profile_id,state,created_at,post_id),
  INDEX ix_feed_post_deleted (state,deleted_at,post_id),
  CONSTRAINT fk_feed_post_profile FOREIGN KEY (profile_id) REFERENCES feed_profile(profile_id),
  CONSTRAINT fk_feed_post_store FOREIGN KEY (store_id) REFERENCES store(store_id) ON DELETE SET NULL,
  CONSTRAINT fk_feed_post_promotion FOREIGN KEY (promotion_id) REFERENCES promotion(promotion_id) ON DELETE SET NULL,
  CONSTRAINT fk_feed_post_news FOREIGN KEY (news_promotion_id) REFERENCES promotion(promotion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_media (
  media_id BIGINT NOT NULL AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  post_id BIGINT,
  original_post_id BIGINT,
  image_key VARCHAR(700) NOT NULL,
  content_type VARCHAR(40) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  byte_count BIGINT NOT NULL,
  position INT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  detached_at DATETIME(6),
  PRIMARY KEY (media_id),
  INDEX ix_feed_media_post (post_id,position,media_id),
  INDEX ix_feed_media_key (image_key),
  INDEX ix_feed_media_orphan (post_id,created_at,media_id),
  CONSTRAINT fk_feed_media_member FOREIGN KEY (member_id) REFERENCES member(member_id),
  CONSTRAINT fk_feed_media_post FOREIGN KEY (post_id) REFERENCES feed_post(post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_report (
  report_id BIGINT NOT NULL AUTO_INCREMENT,
  revision BIGINT NOT NULL DEFAULT 0,
  post_id BIGINT,
  promotion_id BIGINT,
  reporter_id BIGINT NOT NULL,
  reason VARCHAR(20) NOT NULL,
  detail VARCHAR(500),
  snapshot_json LONGTEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  hold BIT(1) NOT NULL,
  note VARCHAR(1000),
  created_at DATETIME(6) NOT NULL,
  resolved_at DATETIME(6),
  PRIMARY KEY (report_id),
  CONSTRAINT uk_feed_report_target UNIQUE (post_id,reporter_id),
  CONSTRAINT uk_feed_report_news UNIQUE (promotion_id,reporter_id),
  INDEX ix_feed_report_status (status,created_at,report_id),
  INDEX ix_feed_report_retention (status,hold,resolved_at,report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_report_image (
  evidence_id BIGINT NOT NULL AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  original_media_id BIGINT NOT NULL,
  owner_id BIGINT NOT NULL,
  image_key VARCHAR(700) NOT NULL,
  content_type VARCHAR(40) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  position INT NOT NULL,
  PRIMARY KEY (evidence_id),
  INDEX ix_feed_evidence_report (report_id,position,evidence_id),
  INDEX ix_feed_evidence_key (image_key),
  CONSTRAINT fk_feed_evidence_report FOREIGN KEY (report_id) REFERENCES feed_report(report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feed_audit_record (
  audit_id BIGINT NOT NULL AUTO_INCREMENT,
  actor_id BIGINT NOT NULL,
  action VARCHAR(32) NOT NULL,
  post_id BIGINT,
  promotion_id BIGINT,
  report_id BIGINT,
  reason VARCHAR(2000),
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (audit_id),
  INDEX ix_feed_audit_target (post_id,report_id,created_at,audit_id),
  INDEX ix_feed_audit_news (promotion_id,report_id,created_at,audit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

삭제는 즉시 비공개·본인 조회에서도 원문/사진 제외이며 복원하지 않아요. 삭제 시각부터 30일이 지난 원문·사진은 최대 100건 후보 batch로 정리하고 파일 삭제 outbox를 사용해요. 미첨부·편집에서 빠진 사진은 24시간 이후 정리해요. 신고의 본문/작성 당시 공개 프로필/사진 메타데이터는 별도 immutable 스냅샷이며 현재 글 편집으로 덮지 않아요. OPEN·hold는 신고 파기를 막고, RESOLVED 및 hold 해제 후 365일 보관해요. 신고 사진의 암호문은 원문과 같은 불변 객체를 참조할 수 있지만 살아 있는 원문/다른 신고 참조가 있으면 outbox 삭제를 넣지 않아요. 신고 증거 사진은 관리자 신고 API로만 읽고 열람·보류/해제·처리·게시물 숨김/복원은 append-only 기록에 남겨요. 회원 탈퇴는 글을 비공개·삭제 상태로 바꾸고 공개 프로필을 숨기며 거래 원장의 회원 FK를 삭제하지 않아요. 정지/폐업된 연결 가게·혜택은 공개 응답에서 연결을 제외해요.

가게 소식의 제목·본문·종류·기간·조건·상태·revision은 `promotion`이 정본이에요. `feed_post.news_promotion_id`는 소식마다 하나만 연결하며 사진·피드 노출·신고를 함께 관리해요. 해당 피드 행의 content는 빈 문자열이고 읽을 때 정본 본문을 사용해요. 새 소식은 공개 프로필을 선택한 뒤 작성하며 기존 소식은 편집할 때 같은 ID에 이 연결을 추가해요. 기존 소식과 피드 노출을 끈 소식도 혜택에서 신고할 수 있고, carrier 없는 기존 신고는 `feed_report.post_id`가 null, promotion_id는 원래 소식 ID예요. 양쪽 화면에서 같은 회원이 같은 소식을 신고하면 하나로 처리하고 신고 원문·기간·조건·사진은 편집/삭제로 재구성하지 않아요. 신고·감사의 promotion_id는 파기 후에도 보존하는 scalar이므로 promotion FK를 걸지 않아요.

행사·혜택 게시에는 offset 있는 시작/종료 시각이 필요하며 UTC로 저장하고 KST로 표시해요. 시작 포함·종료 제외이고 종료 시각은 시작보다 뒤여야 해요. 초안은 일부 입력을 허용하고, 소식·공지에는 기간을 두지 않아요. 기본 혜택 목록은 현재 진행 중인 항목만 보여주며 `period=ALL`과 공개 상세·피드는 지난 항목을 ENDED로 남겨요. 기간 종료는 원문 삭제나 사진 파기의 기산일이 아니에요. 소식의 새 생성/수정 timestamp도 해당 entity의 UTC 콜백을 사용하며 기존 행의 날짜를 일괄 치환하지 않아요.

소식 삭제·관리자 숨김은 정본과 연결된 피드의 공개를 함께 차단하고, 피드에 게시 설정을 끄면 혜택만 공개해요. 공개 사진은 피드 목록 노출 여부와 별도로 소식의 공개 상태를 검사해요. 이전 로그인 전용 소식 목록/상세도 같은 공개 조건을 사용하며, 새 공개 닉네임 소식의 응답에 계정 이름·내부 회원 ID를 덧붙이지 않아요. 이미 삭제한 시각은 재요청·폐업·탈퇴로 다시 시작하지 않아요. 가게 폐업·회원 탈퇴는 기존 `promotion`의 즉시 물리 삭제를 수행하지 않고 소식과 연결 피드를 같은 트랜잭션에서 삭제 상태로 바꿔요. 30일 이후 파기는 연결 피드/미디어 행을 먼저 제거하고 정본을 지우되, 살아 있는 신고 사진 참조는 보존해요. 별도 SNS 자유글의 본문과 사진은 지우지 않으며 소식 선택 링크만 제외해요. 숨김 복원은 초안·삭제·탈퇴·폐업·현재 소유권 상실을 공개로 되돌리지 못해요. 실제 쿠폰 발급·사용과 할인 결제는 이번 소식의 조건 문구와 연결하지 않아요.

피드 감사는 신고 목록에서도 원문 스냅샷을 반환하므로 관리자 원문·사진 열람 정책에 맞춰 각 기록일부터 최소 1년 보존하며 100건 이하 후보 batch로 정리해요. `feed.retention.access-audit-years`는 기본 `1`이며 `1` 또는 `2`만 허용해요. 그 밖의 값은 감사 파기를 중지하며 최소기간을 단축하지 않아요. 해당 신고 또는 같은 게시물의 다른 신고 스냅샷이 남아 있으면 열람·처리·보류·숨김/복원 기록도 함께 보존해요. 신고 자료가 모두 파기된 뒤에도 설정한 최소 1/2년이 지난 기록만 정리하며, 원문 파기만으로 기록을 제거하지 않아요. 이 기간 정리도 피드 API 기능 플래그와 별개예요. 기존 일반 감사의 `AuditRetentionPolicy.AUDIT_DAYS=90`은 변경하지 않아요.

최종 배포 준비에는 익명/본인/타인/관리자, 두 계정, UUID 공개 프로필의 실명·이메일 부재, 초안·비공개·삭제 글과 사진 경계, 다른 글/다른 계정 미디어 재사용 거부, 동일 clientRequestId 재시도, revision 충돌, 닉네임 unique, 신고 후 편집/삭제의 스냅샷 고정, 보류/365일/30일/24시간과 outbox 공유 참조, 피드 감사 최소 1/2년·잘못된 기간의 파기 중지·같은 원문의 신고 연결 기록 보존, 탈퇴/정지/가게 폐업, multipart·픽셀·메타데이터·키 부재를 확인해요. 2026-10-12에 피드·가게 소식·로컬 저장·Redis 등 선별한 백엔드 조건과 새 JAR 전체 **41개 모델**의 제한 계정 `validate`를 실행했어요. 새 JAR의 실제 624개 클래스·142개 라이브러리와 JAR 루트의 `META-INF/orm.xml`을 사용했으며 H2나 소스 클래스 경로만으로 이 결과를 대신하지 않았어요. 테스트의 제한된 entity scan도 같은 ORM 조합이 참조하는 실제 모델을 포함하되 검사 전용 `schema_fixture`는 섞지 않아요. 소식/일반 회원의 사진 게시 PC·모바일 검사는 API fixture 근거이며 실제 휴대폰·로그인 계정의 사용감과 운영 사진 복구를 대신하지 않아요. 운영 적용 전에는 신규 피드 원문·암호문·키를 복구할 새 백업/호환 이미지·프론트·설정을 별도로 확인해요. 기존 `waiting-signup-hidden-v2` 표식이 새 피드 호환성까지 증명한다고 확대하지 않아요.

현재 전체 후보의 자동 배포는 live와 target 모두 `reserve.feature-compat=waiting-signup-hidden-feed-oauth-v7`을 요구해요. 이전 v3~v6 이미지를 재표시해 복구 입력으로 쓰지 않아요. Docker 빌드는 실제 JAR의 기존 개인 숨김·피드·혜택·댓글 경계와 공통 Redis 중계, 16절의 OAuth converter/수신/보안 사건 클래스를 확인해요. 이 포함 관문은 실제 권한·보존·암호화·스키마 검사를 대신하지 않아요. 첫 SNS 전환에는 새 백업·15절/16절의 선별 DDL·제한 계정의 전체 JAR validate·동일 후보의 실제 호환 복구 이미지/프론트/키·설정과 별도 운영 승인이 필요해요. 기존 이미지를 재표시하거나 일반 자동 배포에 우회 옵션을 넣지 않아요.

소식 작성 경로에는 사업자/관리자의 본인 가게·현재 가게 상태·동의·소유권, 업종과 소식 종류 분리, 사진만 수정하는 revision·동일 요청 재시도, 초안→첫 게시·게시→초안 금지, UTC 기간 경계와 종료 항목의 상세/피드 보존, 기본 양쪽 노출/피드 해제, 양쪽 편집·삭제·숨김·신고 중복, carrier 없는 기존 소식과 폐업/탈퇴·30일/사진 outbox·신고/감사 참조를 추가로 확인해요. 후보 ALTER 전후 기존 소식 행 수·제목/본문·주소 보존과 새 JAR 제한 계정 validate를 확인하고, 새 정책에서 삭제된 소식을 다시 공개하는 옛 복구 JAR을 복구 입력으로 쓰지 않아요. 10/12의 로컬 소식 조건·PC/모바일 작성 fixture·전체 41개 모델 검증과 운영 DDL 적용은 별개예요. 이 후보 DDL을 실제 운영 적용 기록으로 표현하지 않아요.

### 15.1 혜택 탭 승인 정책 추가 (2026-10-12, 후보 코드·DDL)

사용자 결정에 따라 혜택 탭 노출만 관리자 심사 대상으로 추가했어요. 별도 SNS 글과 가게 소식의 선택한 피드 게시에는 심사를 적용하지 않아요. 혜택 신청에는 저장된 본인 원문에 붙은 사진 1~6장이 필요해요. 승인 상태는 `NONE/DRAFT/PENDING/APPROVED/REJECTED`로 본문 공개 상태와 분리하고 신청 시각·심사 시각·관리자 scalar ID·사유를 저장해요. 작성/변경 요청의 `benefitRequested`로 신청 또는 철회를 명시해요. 초안은 사진 없이 신청 초안으로 저장할 수 있지만 공개 신청은 사진 없이 처리하지 않아요.

관리자는 `/api/admin/promotions/applications` 목록·상세에서 실제 원문·사진·기간·조건을 검토하고 사유와 확인한 revision을 제출해요. 현재 사업자/관리자 작성 권한·동의·회원→가게→소식→피드→사진의 잠금·현재 소유권·상태를 다시 검사하고, 검토 중 편집·숨김·삭제 또는 다른 관리자의 처리가 있으면 승인하지 않아요. 사진은 `/api/admin/promotions/{id}/images/{imageId}`에서 해당 신청과 첨부 관계를 검사해 no-store로 읽어요. 신청·철회·수정 재심사·승인·반려·목록/원문/사진 열람은 기존 append-only 피드 감사에 남기고 기존 최소 1/2년 정책을 유지해요. 승인된 소식의 제목·본문·종류·기간·조건·사진 순서/구성이 바뀌면 혜택 노출을 중단하고 재심사하며 피드의 새 본문은 선택한 게시 상태로 바로 반영돼요. 피드 노출 선택만 바꾸거나 동일 내용을 다시 저장하면 승인을 취소하지 않아요.

기간 전/종료 후 항목을 제외하는 진행 목록·종료 표시·즉시 숨김/30일 파기·신고 증거 보존 관문은 유지해요. 현재 사업자 권한을 잃은 소식은 승인·공개 목록/건수·상세·연결 피드 노출과 숨김 복원에서 차단하며 일반 회원의 독립 SNS 글은 유지해요. 일반 상세는 승인된 혜택 또는 피드에 공개한 소식만 반환하고, 혜택 미승인·피드 미게시 원문은 본인/전용 관리자 경로 외에 노출하지 않아요. 옛 홍보 API의 목록·조회수 변경 경로도 이 공개 조건을 우회하지 않아요. 가입·실제 결제·할인·쿠폰과 연결하지 않아요.

위 15절의 최초 운영 후보 ALTER에는 이 컬럼을 함께 포함했어요. **15절의 로컬 피드 컬럼이 이미 존재하는 DB에서는 전체 ALTER를 다시 실행하지 않아요.** 먼저 해당 DB의 컬럼/인덱스·직전 백업과 복구 입력을 대조한 뒤, 이 다섯 컬럼이 모두 없을 때만 아래 추가분을 사용하는 후보예요. 일부만 있으면 정확한 차이만 준비해요. 동명 컬럼을 자동 덮거나 기존 행을 삭제하지 않아요.

```sql
SELECT DATABASE(), @@hostname;
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion'
  AND COLUMN_NAME IN ('benefit_state','benefit_requested_at','benefit_reviewed_at','benefit_reviewer_id','benefit_review_note');
SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion'
  AND INDEX_NAME = 'ix_promotion_benefit_review';

ALTER TABLE promotion
  ADD COLUMN benefit_state VARCHAR(16) NOT NULL DEFAULT 'NONE',
  ADD COLUMN benefit_requested_at DATETIME(6),
  ADD COLUMN benefit_reviewed_at DATETIME(6),
  ADD COLUMN benefit_reviewer_id BIGINT,
  ADD COLUMN benefit_review_note VARCHAR(1000),
  ADD INDEX ix_promotion_benefit_review (benefit_state,benefit_requested_at,promotion_id);
```

**이번 승인 정책의 코드/DDL을 추가한 뒤 테스트·린트·빌드·브라우저 검사·스키마 validate는 실행하지 않았어요.** 초기 기록 시점에는 로컬·운영 DDL 모두 미적용이었어요. 이후 로컬 3306의 읽기 조회에서 승인 컬럼 5개와 심사 인덱스가 이미 존재하고, 실행 서버의 설정에도 `benefitApprovalEnabled=true`가 있음을 확인했어요. 이 후속 작업에서는 DDL을 실행하거나 서버를 재시작하지 않았으며 운영은 미적용이에요. 앞선 10/12의 41개 모델 검증은 승인 컬럼을 추가하기 전 후보의 기록이며 현재 후보의 기동/호환성 근거로 재사용하지 않아요. 다음 배포 준비에서 익명·본인·타인·관리자, 사진 없는 신청/초안, 승인 전후 피드 독립 노출, 내용/사진/기간 수정 후 재심사, 동시 심사·stale revision·숨김/삭제·계정 제한, 관리자 사진 열람/감사, 승인된 혜택의 피드 해제 후 사진 읽기, 옛 API 우회, 새 JAR 전체 제한 계정 validate·새 백업/격리 복원·호환 복구 입력을 한 번에 확인해요. 운영 적용과 첫 v7 전환은 새 구체적인 승인 범위에서만 진행해요.

### 15.2 좋아요·댓글·시군구 필터 후보 (2026-10-12, 실행 검증 전)

가게의 기존 `favorite` 기록은 보존하고, `content_like`의 SNS 글/가게 소식을 같은 좋아요 화면에서 모아 보여줘요. 가게 소식의 피드 carrier는 promotion ID로 정규화해 혜택/피드 좋아요를 한 번만 집계해요. 좋아요 쓰기는 목표 상태를 지정하는 PUT이며 회원 잠금과 대상별 unique, 실제 원문 FK를 사용해 재전송·중복 생성·원문 파기 후 고아 기록을 막아요. 삭제·숨김·계정 제한으로 공개할 수 없는 대상은 내 좋아요에서도 본문/사진을 반환하지 않아요. 기존 가게 좋아요와 게시물 좋아요 수를 서로 합산하지 않아요.

댓글은 공개 닉네임의 글과 한 단계 답글(1,000자), 작성 요청 UUID, 본인 수정/revision/삭제를 포함해요. 초안·숨김·삭제된 게시물에는 읽기/작성을 허용하지 않아요. 숨긴 부모 댓글의 답글도 공개 조회에서 제외하며 삭제된 부모는 기존 답글을 위한 빈 자리만 남겨요. 탈퇴 시 본인 댓글을 즉시 숨기고 좋아요를 제거해요. 댓글 삭제 원문은 30일 뒤 파기하며 답글이 남으면 본문을 비운 부모만 유지해요. 댓글 신고는 독립 스냅샷과 scalar 대상 ID로 보존하므로 원문/계정 삭제와 함께 지우지 않아요. 관리자 열람·숨김/복원·처리를 감사에 남기며 처리 완료 후 365일·파기 보류/보류 해제 시 재기산 정책을 적용해요. 해당 댓글 신고가 남으면 관련 게시물 감사도 보존해요.

이 시군구 후보는 앞선 위치 모달 재사용 요청으로 구현했으며, 후속 선택에 따라 피드 위치 필터는 유지하고 공개 게시물 기준으로 조회해요. `GET /api/feed/regions`는 공개 목록과 같은 원문/프로필/회원/소식 상태 조건으로 집계하며 가게 수를 사용하지 않아요. 지역이 없거나 시도 단위인 글은 현재 공개 가능한 연결 가게 주소로 시군구를 조회하고, 비공개/삭제/제재된 가게나 소유자의 주소는 집계와 지역 필터에 사용하지 않아요. 응답은 시도·시군구·공개 게시물 수만 포함하고 상세 주소는 반환하지 않아요. 작성 지역 입력은 숨긴 상태이며 기존 값은 편집 때 보존해요. 기존 지역 값과 스키마를 보존하며 이번 후속에서 새 DDL을 실행하지 않아요. 새 후보의 region 길이는 50이고 시도 선택은 하위 지역도 포함해요. 임의의 문자열/LIKE 와일드카드는 지역 입력에서 허용하지 않아요.

`FEED_INTERACTIONS_ENABLED`는 운영 기본 `false`, 로컬 프로필의 새 후보에서는 `true`예요. 일반 피드에는 FEED_ENABLED, 혜택 좋아요에는 독립적인 STORE_NEWS_ENABLED 활성화가 필요해요. 비활성화가 보존 기간 파기/탈퇴 정리를 막지 않으며 **세 entity는 기능 플래그와 무관하게 전체 JAR validate 대상**이에요. 아래는 대상/기존 컬럼/테이블을 대조한 뒤 사용하는 후보 입력이며 이번 작업에서 실행하지 않았어요. 후속 읽기 조회에서 로컬 3306의 region은 VARCHAR(50)이며 세 테이블과 unique/CHECK/FK, 원문 CASCADE·프로필/부모 SET NULL이 이미 존재함을 확인했어요. 따라서 로컬에 후보 DDL을 중복 적용하지 않았어요. 기존 15절 최초 CREATE는 이미 50자로 맞췄으므로 그 CREATE를 새로 적용했다면 ALTER를 반복하지 않아요.

```sql
SELECT DATABASE(), @@hostname, @@port;
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('feed_post','content_like','feed_comment','feed_comment_report');

-- 기존 10자 컬럼이 확인된 경우에만 적용할 확대 후보
ALTER TABLE feed_post MODIFY COLUMN region VARCHAR(50) NULL;

CREATE TABLE content_like (
  like_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  post_id BIGINT,
  promotion_id BIGINT,
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT uk_content_like_post UNIQUE (member_id,post_id),
  CONSTRAINT uk_content_like_news UNIQUE (member_id,promotion_id),
  CONSTRAINT ck_content_like_target CHECK
    ((post_id IS NOT NULL AND promotion_id IS NULL) OR (post_id IS NULL AND promotion_id IS NOT NULL)),
  INDEX ix_content_like_member (member_id,created_at,like_id),
  CONSTRAINT fk_content_like_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE CASCADE,
  CONSTRAINT fk_content_like_post FOREIGN KEY (post_id) REFERENCES feed_post(post_id) ON DELETE CASCADE,
  CONSTRAINT fk_content_like_news FOREIGN KEY (promotion_id) REFERENCES promotion(promotion_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE feed_comment (
  comment_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT NOT NULL,
  profile_id BIGINT,
  parent_id BIGINT,
  content TEXT NOT NULL,
  state VARCHAR(16) NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  client_request_id VARCHAR(36),
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  deleted_at DATETIME(6),
  CONSTRAINT uk_feed_comment_request UNIQUE (profile_id,client_request_id),
  INDEX ix_feed_comment_post (post_id,parent_id,created_at,comment_id),
  INDEX ix_feed_comment_profile (profile_id,state,comment_id),
  INDEX ix_feed_comment_retention (state,deleted_at,comment_id),
  CONSTRAINT fk_feed_comment_post FOREIGN KEY (post_id) REFERENCES feed_post(post_id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_comment_profile FOREIGN KEY (profile_id) REFERENCES feed_profile(profile_id) ON DELETE SET NULL,
  CONSTRAINT fk_feed_comment_parent FOREIGN KEY (parent_id) REFERENCES feed_comment(comment_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE feed_comment_report (
  report_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  revision BIGINT NOT NULL DEFAULT 0,
  comment_id BIGINT NOT NULL,
  post_id BIGINT NOT NULL,
  reporter_id BIGINT NOT NULL,
  reason VARCHAR(20) NOT NULL,
  detail VARCHAR(500),
  snapshot_json LONGTEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  hold BIT(1) NOT NULL DEFAULT b'0',
  note VARCHAR(1000),
  created_at DATETIME(6) NOT NULL,
  resolved_at DATETIME(6),
  CONSTRAINT uk_feed_comment_report UNIQUE (comment_id,reporter_id),
  INDEX ix_feed_comment_report_status (status,created_at,report_id),
  INDEX ix_feed_comment_report_post (post_id,report_id),
  INDEX ix_feed_comment_report_retention (status,hold,resolved_at,report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

다음 배포 준비에서는 공개/타인/본인/관리자 경로, 대상별 중복 좋아요·혜택 내부 행의 피드 경로 차단, 초안 비공개, 댓글 재전송·다른 게시물 답글·2단계 답글·stale revision, 부모 삭제/숨김, 탈퇴, 실제 FK/CHECK/unique/cascade, 댓글 원문 파기와 신고 보존/보류/감사를 확인해요. 새 전체 JAR·제한 계정 validate와 새 백업·격리 복원·현재 전체 후보의 v7 호환 복구 묶음이 필요해요. 로컬 `/api/feed/interactions/config`의 활성화·댓글 1,000자·답글 한 단계 설정과 사진 2장이 붙은 기존 임시저장 보존은 읽기로 확인했어요. 후속 구현의 로컬·격리 API/DB 검사 범위와 결과는 15.5를 참고해요. 운영 스키마의 새 전체 JAR validate·백업·격리 복원은 아직 실행하지 않았으며 로컬 성공을 운영 통과로 표현하지 않아요.


### 15.4 피드·혜택 공개 경로 분리 (2026-10-13, 운영 미적용)

SNS와 혜택의 작성·게시·지역 집계·좋아요 대상을 분리해요. STORE_NEWS_ENABLED는 FEED_ENABLED와 독립이며 혜택 사진은 /api/store-news/media 경로에서 승인 상태와 회원·가게 권한을 확인해요. 기존 promotion 원문·feed_post 사진 참조·feed_profile 소유 행·암호문·신고·감사 자료는 유지하며 새 컬럼·테이블이나 데이터 이관이 필요하지 않아요. 공개 닉네임이 없는 내부 사진 소유 행은 피드 프로필·목록에 노출하지 않아요. 기존 피드 ID 경로로 혜택을 조회·삭제·신고·좋아요 처리할 수 없어요. 혜택 수정 재심사와 30일 파기·신고 보존은 유지해요.

### 15.5 신고 검토 동시 편집 보호 (2026-10-13, 운영 미적용)

`feed_report`, `feed_comment_report`, `chat_report`에 JPA `@Version`용 `revision`을 추가해요. 신고 처리 API와 채팅 신고 보존 변경 API는 조회 당시의 버전을 필수로 받고 행 잠금 후 비교해요. 뒤늦은 상태 변경·파기 보류 해제는 409로 거부하며, 일반 피드·소식·댓글 신고의 처리 사유는 DTO와 서비스에서 모두 필수예요. 글·소식·댓글 숨김/복원은 신고 버전과 별도로 현재 원문의 버전을 검사하고 신고 당시 스냅샷은 바꾸지 않아요. 프론트는 신고 검토와 원문 공개 변경의 버전을 따로 고정하며 자동 재조회가 기존 입력을 새 버전으로 제출하게 하지 않아요. 명시적인 재조회가 성공해야 최신 상태로 다시 처리할 수 있고, 본인의 공개 변경 성공은 미저장 신고 처리 입력을 덮어쓰지 않아요.

기존 테이블의 운영 후보 DDL은 아래와 같아요. 대상·직전 백업/격리 복원·현재 컬럼을 확인하고 별도 승인된 DDL 계정으로 새 서버 배포 전에 적용해요. 이미 있는 컬럼에는 다시 실행하지 않아요. 기존 증거·메모·보류·기산일은 변경하지 않으며 이전 행의 버전만 0으로 시작해요.

```sql
ALTER TABLE feed_report ADD COLUMN revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE feed_comment_report ADD COLUMN revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE chat_report ADD COLUMN revision BIGINT NOT NULL DEFAULT 0;
```

로컬 `localhost:3306/reserve`는 코드 컴파일 뒤 기존 개발 서버의 `ddl-auto:update` 재로딩으로 세 컬럼이 추가된 것을 읽기 조회로 확인했어요. 이 작업에서 수동 DDL이나 운영 DB 연결·DDL은 실행하지 않았어요. 제한 계정의 새 전체 JAR `validate`, 운영 적용, 운영 백업·복구는 별도 확인이 필요해요. 운영에서 `update`나 root 계정으로 검증 실패를 우회하지 않아요.

최종 후보의 권한·초안 비공개·사진 접근·재심사·신고 보존·신고 사유/버전 충돌·CSRF·로그인 복귀·환불 안전장치는 선택한 백엔드 검사 188건에서 확인했어요. 별도의 격리 H2·HTTP API 흐름 검사 4건은 초안의 반복 조회/수정, 댓글 수정·삭제·한 단계 답글, 신고 검토 충돌, 혜택 승인 후 수정 재심사를 확인해요. 이 결과는 실제 결제·OAuth 제공자·사진 원본 저장소 또는 운영 스키마/복구 실행의 성공 근거가 아니에요. 운영 DDL·제한 계정의 새 전체 JAR validate·직전 백업/격리 복원은 별도 승인과 확인이 남아 있어요.


### 15.6 댓글 사진·댓글 좋아요·피드 알림 후보 (2026-10-14, 운영 미적용)

사진 1~6장을 댓글·한 단계 답글에 첨부하고 수정 시 순서를 교체할 수 있어요. 텍스트 또는 사진이 있어야 저장하며 사진은 작성자 소유·단일 원문 귀속을 검사하고 기존 암호화 업로드/읽기 관문을 사용해요. 글·소식·댓글 사이의 사진 재사용과 타인 사진 ID를 차단해요. 댓글 좋아요는 종합 좋아요에 포함하고 목표 상태 PUT·회원/원문 잠금·대상별 unique를 유지해요. 댓글·답글·댓글 좋아요의 앱 내 알림은 자기 자신에게 발송하지 않으며 동일 이벤트를 중복 생성하지 않아요. 수신자만 조회·읽음 처리할 수 있고 삭제/숨김/계정 제한된 원문과 작성자의 알림은 노출하지 않아요. 알림은 생성일로부터 90일 후 파기하고 탈퇴 시 수신/발신 알림을 제거해요. 이메일·브라우저 푸시 발송은 추가하지 않았어요.

신고 당시 댓글 사진은 FK 없는 원문/회원 식별값과 독립 암호문 참조를 가진 feed_comment_report_image로 보존해요. 관리자 증거/현재 사진 읽기는 별도 관리자 경로·no-store·열람 감사로 처리해요. 원문 삭제 후 30일 파기와 신고 처리 완료/보류 해제 후 365일 파기는 같은 파일 소유자 잠금으로 직렬화하고, 원문과 모든 신고 증거 참조가 사라져야 파일 삭제 의도를 기록해요.

후보 DDL 정본은 [feed-comment-v6.sql](../../scripts/sql/feed-comment-v6.sql)이에요. feed_media의 comment_id/original_comment_id·단일 부모 CHECK/인덱스/FK, content_like의 comment_id·unique/FK/세 대상 CHECK, 증거/알림 두 테이블을 추가해요. 이전 두 대상 CHECK는 실제 이름을 정보 스키마에서 읽어 같은 ALTER에서 교체해요. 조건에 맞는 CHECK가 정확히 한 개가 아니면 PREPARE 단계에서 중단해요. 이미 일부 컬럼/테이블이 있으면 파일을 재실행하지 말고 실제 구조를 대조해요. MySQL DDL은 자동 커밋이므로 운영 적용 전 새 전체 후보·제한 계정 validate·직전 백업과 격리 복원·복구 입력을 준비하고 별도 DDL 승인을 받아요.

15.6을 추가한 당시 후보의 복구 호환 표시는 waiting-signup-hidden-feed-v6였어요. v5의 고아 사진 작업자는 댓글 사진을 고아로 잘못 분류하며 이전 좋아요 모델은 댓글 대상을 읽을 수 없어 재표시/복구에 쓰지 않아요. 당시 Docker JAR 포함·자동 배포/복구 관문과 CI 계약을 v6로 갱신했으며, 10/16 현재 전체 후보의 v7 관문은 위 최신 범위와 16절을 따라요. 첫 전환은 새로운 호환 복구 묶음과 운영 스키마 승인이 필요해요.

이번 작업에서 확인한 로컬 127.0.0.1:3306/reserve(DESKTOP-2R1IST7)에 후보 DDL을 적용했어요. 새 컬럼 3개와 테이블 2개를 확인했고 기존 피드 DRAFT 2건/PUBLISHED 1건·소식 DRAFT 1건을 유지했어요. 별도 승인된 로컬 정리로 기존 삭제 글 4건·소식 2건·미디어 연결 4건을 삭제하고 파일 의도 4건을 큐에 넣었어요. 이후 같은 로컬 연결의 source_type=local_deleted_cleanup 집계에서 네 파일 삭제 작업 모두 COMPLETED임을 확인했어요. 테스트·린트·빌드·자동 브라우저 검사·새 JAR validate·운영 적용은 이번 후보에서 실행하지 않았어요. 15.5의 188/4건 기록은 이전 입력의 결과로 이 후보의 통과 근거가 아니에요.

### 15.7 혜택 디자인·자동 갱신 후보 (2026-10-15, 운영 미적용)

정본은 [benefit-design.sql](../../scripts/sql/benefit-design.sql)이에요. `promotion`에 `benefit_design VARCHAR(16) NOT NULL DEFAULT 'STANDARD'`와 `STANDARD|PHOTO|COMPACT` CHECK를 추가해요. 기존 행은 기본 디자인으로 시작하고 원문·사진·승인 기록은 바꾸지 않아요. 디자인 변경은 심사 대상 변경으로 처리하며 옛 클라이언트가 값을 생략하면 저장된 디자인을 유지해요. 기능 비활성 상태도 새 전체 JAR의 스키마 검증 대상이므로 컬럼을 먼저 준비해요.

운영 적용 전 실제 컬럼/CHECK 유무와 직전 백업·격리 복원·제한 계정 validate·호환 복구 입력을 준비하고 승인된 DDL 계정으로 한 번만 적용해요. 이전 v6 JAR은 추가 컬럼을 읽지 않지만 새 디자인의 표시·저장은 지원하지 않아요. 복구를 위해 컬럼을 삭제하거나 기존 값을 다시 쓰지 않아요. SSE는 커밋 후 갱신 신호만 전송하며 별도 테이블이나 메시지 원문을 만들지 않아요.

로컬 `localhost:3306/reserve`, 서버 `DESKTOP-2R1IST7`에서 적용했어요. 실행 도중 IDE 연결이 끊겨 동일 DDL을 재실행하지 않았으며, 재연결 후 정보 스키마에서 컬럼의 타입·NOT NULL·기본값과 CHECK를 확인했어요. 운영 DB 변경·서버 재시작·새 JAR validate·테스트·린트·빌드·자동 브라우저 검사는 실행하지 않았어요. 이전 후보의 검사 결과를 이 변경의 통과 근거로 사용하지 않아요.

### 15.8 별도 피드 프로필 사진 후보 (2026-10-15, 운영 미적용)

정본은 [feed-profile-avatar.sql](../../scripts/sql/feed-profile-avatar.sql)이에요. `feed_profile.custom_avatar_key VARCHAR(1024) NULL`과 `ck_feed_profile_avatar_source` CHECK를 추가해요. 별도 사진이 있으면 계정 사진 사용은 꺼져 있어야 해요. 기존 공개 동의 값은 바꾸지 않고, 새 공개 프로필은 별도 사진이 없으면 계정 사진을 사용해요. 사진을 교체·해제하거나 탈퇴하면 본인 경로의 이전 별도 사진만 삭제 outbox에 넣어요. `PUT /api/feed/me/profile/avatar`의 `image` multipart는 기존 계정 사진의 파일 검사·저장·롤백 보상을 재사용하고 `users/{memberId}/feed/profiles`에 저장해요.

운영에서는 실제 컬럼·CHECK와 직전 백업·독립 다운로드·격리 복원·새 전체 JAR의 제한 계정 `validate`를 확인하고 별도 승인된 DDL 계정으로 적용해요. 이미 있는 컬럼에는 원본 ALTER를 다시 실행하지 않아요. 기존 v6 복구 JAR에는 새 컬럼·사진 삭제 수명주기가 없으므로 같은 v6 표식만으로 호환을 판단하지 않아요. 최종 후보와 새 호환 복구 묶음을 함께 검증하며 복구를 위해 컬럼·기존 사진 값을 삭제하지 않아요.

#### 2026-10-15 로컬 적용과 후속 검증

15.8의 별도 피드 프로필 사진에 한해 로컬 `127.0.0.1:3306/reserve`, 서버 `DESKTOP-2R1IST7`에서 개발 서버가 nullable 컬럼을 먼저 추가한 상태를 읽기로 확인했어요. 보호 경로에 직전 전체 SQL 백업을 만든 뒤 누락된 CHECK만 적용했고 기존 프로필 1건·별도 사진 0건을 유지했어요. IDE DDL 요청은 응답이 지연돼 중단했으며, 직접 메타데이터 조회에서 미반영·실행 중인 해당 DDL 없음·위반 행 0건을 확인한 다음 로컬 CLI로 CHECK만 적용했어요. 운영 DDL·운영 백업/복원·운영 제한 계정 검증은 수행하지 않았어요.

이 15.8 변경 뒤 당시 새 전체 로컬 JAR을 `ddl-auto=validate`로 기동해 매핑 검증을 통과했어요. 이 서버는 로컬 개발 DB 계정을 사용하며 운영 `reserve_app` 검증을 대신하지 않아요. 선택한 백엔드 검사 43개 중 사진·저장소 경계 25개를 포함한 42개가 통과했고, 기존 삭제 글 소유자 조회의 테스트/서비스 기대 불일치 1개는 남았어요. 원형 프로필 사진 UI·새 피드 사진 저장 순서·계정 변경 경계와 실제 운영 S3 업로드/삭제 성공은 구분해요.

같은 날 후속 점검에서 위 1건은 작성자에게 빈 삭제 표시를 반환하던 옛 테스트 기대임을 확인했어요. 현재 삭제 정책·서비스의 404를 유지하고 작성자·익명·타인 모두 404와 사진 조회 없음으로 검사를 수정했어요. 삭제 글·삭제 소식의 피드 경로·삭제 사진 접근을 대상으로 한 백엔드 검사 3건이 통과했어요. 이 수정은 삭제 원문 조회를 다시 허용하지 않으며 최종 후보의 전체 검사·새 JAR 검증을 대신하지 않아요. 이 기록은 아래 16절 OAuth DDL이나 v7 전체 JAR 검증 결과가 아니에요.

## 16. OAuth 토큰 보호와 공급자 보안 사건 후보 (운영 미적용)

2026-10-16 전체 후보는 활성 OAuth 토큰의 선택적 애플리케이션 암호화, Google/Kakao 서명 사건과 Naver 연결 해제 알림, 로그인/사건이 공유하는 주체별 잠금 상태를 추가해요. 모든 수신 flag는 기본 false이며 실제 공급자 등록·운영 활성화는 하지 않았어요. 지원 범위·검증 상태·키 복구는 [계정 보안](account-security.md)을 따라요. flag=false여도 새 엔티티/컬럼은 새 전체 JAR의 스키마 검사 대상이에요.

| 정의 | 새 후보 | 보존 규칙 |
|---|---|---|
| `member.oauth_access_token` | nullable `VARCHAR(2048)` → `TEXT` | 기존 charset/collation·평문/NULL 그대로, 일괄 암호화 없음 |
| `member.oauth_authenticated_at` | nullable `DATETIME(6)` | 정상 새 인증의 UTC 시각, 과거 회원 시각을 추정해 백필하지 않음 |
| `member.oauth_security_revoked_at` | nullable `DATETIME(6)` | 기존 회원의 사건 cutoff, 사건 전 진행 중인 로그인 복원 차단 |
| `idx_member_oauth_subject` | `(provider, provider_id, deleted_at)` 비고유 인덱스 | 다른 주체까지 전체 스캔으로 잠그지 않도록 조회 범위를 좁힘. 기존 중복을 지우거나 unique로 바꾸지 않음 |
| `oauth_subject_security` | 새 테이블 | provider+subject의 SHA-256 가명 키 PK·provider·UTC 인증/폐기 고수위·갱신 시각. 회원이 없을 때의 cutoff도 유지 |
| `oauth_security_event` | 새 테이블 | provider+사건 ID 해시 unique, 처리 시각/결과만 보관. 원문·subject·토큰 저장 없음 |

선별 후보는 [oauth-security-v7.sql](../../scripts/sql/oauth-security-v7.sql)이에요. 10/14 준비용 백업의 실제 member 정의를 읽어 MySQL 8.0.45·DB reserve·원래 nullable varchar(2048)/utf8mb4_0900_ai_ci·provider enum/식별자/삭제 시각·새 정의와 인덱스 부재를 사전 검사해요. `feed-v6-from-v2.sql`은 당시 v6 DDL 연습의 정본 그대로 보존하고 필요한 16절을 별도 단계로 적용해요. 운영 조회가 달라지면 이 파일을 그대로 실행하지 않고 차이부터 다시 선별해요. **`--force` 없는 mysql CLI**를 사용하고 사전 검사 실패·부분 적용 때 자동 재실행하지 않아요. DDL 계정은 정의를 읽을 `SELECT`와 승인된 DDL 권한이 필요하며 DML 권한은 주지 않아요.

실제 정의 대조에는 두 새 테이블의 PK·`uk_oauth_security_event_hash(event_hash)`·`idx_oauth_security_event_processed(processed_at)`와 세 CHECK(두 provider: GOOGLE/KAKAO/NAVER, outcome: APPLIED/IGNORED)의 강제 여부를 포함해요. `validate`만으로 CHECK·unique·인덱스의 검증을 대신하지 않아요. 독립 `VerifyDatabaseSchema`는 폴더명과 무관한 실제 어노테이션 스캔으로 OAuth outbox/새 inbox/subject 모델도 포함해요. 15절의 47테이블 복원 연습은 v6 입력의 기록이에요. 새 v7의 실제 JAR 모델 수와 전체 테이블 수는 최종 JAR의 어노테이션·ORM 매핑 및 격리 복원 스키마로 각각 확인하며, 이전 수치를 재사용하지 않아요.

subject와 Naver·조회 인덱스를 포함한 현재 SQL을 MySQL 8.0.45의 network none·공개 포트/영구 볼륨 없는 일회용 합성 DB에 적용했어요. 2048자/NULL 원본 두 행·authVersion·NULL 시각과 기존 중복 주체 보존, 비고유 인덱스의 실제 열 순서, 세 CHECK와 두 unique의 실제 거절, Naver 허용, DML 롤백, 재실행/다른 DB의 DDL 전 중단, 앱 DDL/DDL 계정 DML 거부를 확인했어요. SQL SHA-256은 `df5485625ef2ab32527cffd9bb47bd562d6897c1a458d6d8d6f3a3673d7f492c`이며 시험 컨테이너는 제거했어요. 앞선 두 CHECK·인덱스 전 해시의 검사는 당시 입력의 기록으로 현재 SQL을 대신하지 않아요. 이 검사는 운영 스키마 재조회·새 백업의 전체 복원·새 실제 JAR validate를 대신하지 않아요.

복구는 `waiting-signup-hidden-feed-oauth-v7`의 실제 JAR/이미지·같은 SHA의 세 프론트·필요한 키/환경·현재 DB를 함께 준비해요. 암호문 저장 뒤 구 v6 앱이나 단순 flag=false로 복귀하지 않아요. `TEXT`를 다시 varchar로 줄이거나 새 컬럼/처리 이력을 삭제하는 것을 기본 복구로 삼지 않아요. 기존 운영 DB·개발 DB에 이 DDL을 적용한 기록은 없으며 최종 후보 JAR·전체 스키마의 독립 복원 검증은 남아 있어요.
