# 수동 DDL 런북

`ddl-auto: update`는 **엔티티에 필드를 추가할 때 컬럼을 만들어주는 것까지만** 한다.
아래 것들은 **자동으로 반영되지 않으니 여기에 적고 손으로 적용**한다.

- 컬럼 **삭제**
- 컬럼 **타입 변경** (`VARCHAR(255)` → `VARCHAR(500)` 등)
- 제약 조건 변경 (NOT NULL, UNIQUE, FK)
- **FULLTEXT 인덱스** (Hibernate가 만들지 못한다)
- 인덱스 **이름 변경** — 새 이름으로 하나 더 생기고 옛 인덱스가 그대로 남는다

적용 원칙:
1. **DDL 전에 복구 관문을 완료한다.** Lightsail snapshot 상태 확인 → 최소 권한 S3/IAM과
   lifecycle/versioning → 서버 backup/restore 스크립트·환경 파일·cron → 첫 수동 백업의 gzip·크기·
   S3 객체 → 격리 `reserve_restore_*` 복원과 핵심 행 수 → 실패 알림·날짜별 evidence 순서다.
2. 이 관문 중 하나라도 증거가 없으면 운영 DDL을 시작하지 않는다. 저장소에 스크립트가 있다는 사실이나
   H2 자동 생성은 복구 가능성의 증거가 아니다.
3. 적용 전 운영 MySQL은 읽기 전용으로 조사하고, 실제 `SHOW CREATE TABLE`·인덱스·행 수를 근거로
   대상 DDL을 다시 검토한다.
4. 적용 후 이 문서의 **이력 표에 한 줄** 남긴다. 남기지 않으면 서버 재구축 때 재현할 수 없다.
5. 서버 재구축 시에는 적용 이력과 의존 순서를 확인해 DDL을 재현한다.

2026-09-27 기준 운영은 v2.6.3이다. 기존 OAuth/결제/refresh rotation 구조는 운영 릴리스와 별도로 대조하고,
이 혼합 프리뷰의 채팅/광고/검색 변경까지 모두 미적용 또는 모두 적용됐다고 계산하지 않는다.
9/25 백업·격리 복원 증거는 존재한다. 아래 SQL은 실행 승인이 아니며 스키마별 현황은 [현재 상태](current-status.md)를 따른다.

접속:
```bash
export DB_PASSWORD="$(sudo sh -c '. /etc/reserve-backup.env; printf %s "$DB_PASSWORD"')"   # 비밀번호 기준: /etc/reserve-backup.env (backup.md 7장)
docker exec -it -e MYSQL_PWD="$DB_PASSWORD" mysql mysql -u root reserve
```

---

## 1. 가게 검색 FULLTEXT 인덱스 (ngram)

### 배경

`StoreSearchSpecification`의 LIKE 폴백은 5개 컬럼에 `LOWER(col) LIKE '%kw%'`를 쓴다.
**앞에 와일드카드가 붙고 컬럼에 함수가 걸려 있어 인덱스를 전혀 타지 못한다** — 검색 한 번마다
`store` 테이블 풀스캔이다. 데이터가 늘면 가장 먼저 문제가 되는 지점이고,
느린 쿼리가 커넥션을 오래 붙잡아 커넥션 풀 고갈로 이어진다.

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

> `ngram_token_size`는 **서버 재시작이 필요한 전역 설정**이고, 바꾸면 기존 FULLTEXT 인덱스를
> 전부 재생성해야 한다. 기본값 2로 두는 것을 권장한다(한글 2글자 검색이 가장 흔하다).

### 적용 후 켜기

`application-prod.yml`:
```yaml
search:
  store:
    fulltext-enabled: true
```

인덱스를 만들지 않고 이 값을 켜면 검색마다
`Can't find FULLTEXT index matching the column list`로 실패한다. **DDL이 먼저다.**

### 확인 방법

```sql
-- 풀스캔이 사라졌는지: type=fulltext, key=ft_store_search 가 나와야 한다
EXPLAIN SELECT * FROM store
 WHERE MATCH(store_name, description, address, category, keywords)
       AGAINST('+강남' IN BOOLEAN MODE);
```

### 2026-09-22 코드 기록과 현재 남은 확인

- LIKE와 FULLTEXT 모두 `deleted_at IS NULL AND status = 'ACTIVE'`를 적용한다. 내용 쿼리와 count 조건을 일치시킨다.
- 별점·리뷰·최신순은 **DB 전체 정렬 후 페이지**다. 동점은 `store_id DESC`로 고정한다.
- 서비스 분야와 지역은 Java 전체 로딩 후 필터하지 않고 LIKE 검색과 같은 DB predicate/count에 포함한다.
  기존 `service_domain IS NULL` 행은 자유 카테고리의 기존 추론 규칙을 DB 조건으로 재현한다.
- 거리순은 국내 전체를 포함하는 1,000km bounding-box 좌표 후보만 DB에서 고르고, 구면 거리와 같은
  cosine 내림차순·`store_id DESC`로 정렬한 뒤 페이지를 제한한다. 좌표가 없거나 후보 밖인 행은 거리순 결과에 없다.
- 1글자 토큰·BOOLEAN 연산자 제거 후 빈 검색어는 LIKE로 돌아간다. 정제 결과가 비었다고 원문을 BOOLEAN 연산자로 다시 전달하지 않는다.
- LIKE의 `%`·`_`·escape 문자는 문자 그대로 검색한다. FULLTEXT와 LIKE의 단어 해석이 완전히 같다는 뜻은 아니다.
- 이 코드의 짧은 토큰 분기는 `ngram_token_size=2`를 전제로 한다. 설정 변경 시 분기/테스트도 함께 바꾼다.
- 분야·지역·추천·거리 조건이 있으면 FULLTEXT 플래그가 켜져 있어도 현재는 LIKE Specification 경로를 쓴다.
  필터까지 포함한 MySQL 쿼리 동등성과 실행 계획을 검증하기 전에는 두 경로를 섞지 않는다.

기본 파서와 ngram의 분절 방식은 다르며, ngram은 CJK 검색을 지원한다.
MATCH 컬럼 목록과 FULLTEXT 인덱스 정의의 일치를 확인한다.
[MySQL FULLTEXT 제한](https://dev.mysql.com/doc/refman/8.0/en/fulltext-restrictions.html),
[ngram 파서](https://dev.mysql.com/doc/refman/8.0/en/fulltext-search-ngram.html).

H2에서는 LIKE·분야·지역·추천·거리 후보/정렬·205건 페이지 경계를 확인했고, FULLTEXT는 Mockito로 호출 계약만 확인했다.
**실제 MySQL SQL 실행·인덱스·EXPLAIN 검증은 미완료**다. 운영 DDL은 실행하지 않았다.
승인된 별도 검증 DB에서 커밋된 fixture로 검색어·연산자·삭제/정지·동점·깊은 페이지와 count를 대조한 뒤 적용한다.
LIKE와 FULLTEXT 결과 동등성·`EXPLAIN`·DDL을 MySQL 8에서 확인하기 전까지
`search.store.fulltext-enabled`는 꺼진 상태를 유지한다. 운영에서 이미 활성이라는 주석이나 문서 표현은
증거로 사용하지 않는다.

---

## 1-b. 가게 거리순 bounding-box 후보 인덱스

코드는 인덱스가 없어도 동작하지만 후보 조회가 커지면 `store` 풀스캔이 될 수 있다. 운영 반영 전에
별도 MySQL 8에서 실제 분포를 넣고 아래 후보 인덱스와 다른 열 순서를 `EXPLAIN ANALYZE`로 비교한다.
H2 성공이나 정적 DDL만으로 운영 적용 완료라고 표시하지 않는다.

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

위 수치는 서울 기준 1,000km 후보의 설명용 예시다. 실제 애플리케이션은 요청 좌표에서 경계값을
계산한다. MySQL optimizer가 새 인덱스를 선택하는지, 반환 순서·count가 LIKE 폴백과 기대대로인지
확인한 뒤에만 이력 표를 갱신한다.

---

## 2. 광고 금융 원장: 배포 전후 스키마 확인

코드의 새 테이블은 `ad_payment_attempt`다. 기존 `advertisement.status`에는
`REFUND_PENDING`, `REVIEW_REQUIRED` 상태가 추가된다. 코드가 기대하는 타입은 `varchar(20)`이다.

아래는 **조회 예시**이며 이번에는 실행하지 않았다. 승인된 DB 연결에서 먼저 확인한다.
비밀번호를 명령 인자나 출력에 복사하지 않는다.

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'advertisement'
  AND COLUMN_NAME = 'status';

-- 새 코드의 스키마 생성 후 확인
SHOW CREATE TABLE ad_payment_attempt;
SHOW INDEX FROM ad_payment_attempt;
```

- 현재 status가 충분한 VARCHAR면 enum 값 추가를 위한 ALTER는 필요하지 않을 수 있다.
- 구 ENUM/좁은 길이/다른 제약이면 자동 반영을 기대하지 말고 실제 스키마를 근거로 별도 DDL을 승인받는다.
- 새 원장의 merchant_uid UNIQUE, 식별자/원금 NOT NULL, due/store/owner/ad 인덱스를 확인한다.
- 신규 테이블 생성 자체도 운영 스키마 변경이다. 로컬 H2 자동 생성 성공을 운영 적용으로 기록하지 않는다.
- 새 상태를 쓴 뒤 구버전 백엔드로 되돌리는 호환성은 [광고 결제 런북](ad-payments.md)의 롤백 경계를 따른다.

---

## 3. 계정 보안·로그인 유지 (v2.6.1): 배포 전후 확인

`ddl-auto: update`가 아래를 만든다. 모두 **추가만** 있고 삭제·타입 변경은 없다.

| 대상 | 변경 | 쓰는 곳 |
|---|---|---|
| `member.auth_version` | `INT NOT NULL DEFAULT 0` 추가 | 비밀번호 변경·재설정 시 모든 세션 무효화 |
| `refresh_token.previous_token_hash` | `VARCHAR(64) NULL` + `idx_refresh_token_previous_hash` | refresh 회전 직전 토큰 식별 |
| `refresh_token.rotated_at` | `DATETIME(6) NULL` | 직전 토큰 유예(60초) 판정 |
| `oauth_unlink_task` | 새 테이블 | 탈퇴 OAuth 연동 해제 outbox |
| `marketing_consent_history` | 새 테이블 | 마케팅 동의·철회 이력(append-only) |

로컬 H2에서 생성됐다는 사실은 운영 MySQL에 올바른 제약·기본값이 생겼다는 증거가 아니다.
새 앱 기동 뒤 읽기 전용으로 확인한다(`scripts/verify-post-deploy-readonly.sh`가 같은 항목을 본다).

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

- `auth_version`은 `INT NOT NULL DEFAULT 0`, 기존 회원은 모두 0이어야 한다.
- `refresh_token`에 `idx_refresh_token_previous_hash`가 있어야 한다. 없으면 직전 토큰 조회가 풀스캔이 된다
  (동작은 한다). Hibernate가 만들지 못했을 때만 백업 뒤 아래를 적용하고 이력에 남긴다.
  ```sql
  CREATE INDEX idx_refresh_token_previous_hash ON refresh_token (previous_token_hash);
  ```
- `oauth_unlink_task.task_key` unique(`uk_oauth_unlink_task_key`), `(status,next_attempt_at)` 인덱스,
  nullable `lease_id`를 확인한다.
- 마케팅 동의 이력은 `(member_id,created_at)` 인덱스를 확인한다.
- 제약이 다르면 즉시 ALTER하지 말고 실제 `SHOW CREATE TABLE` 결과를 근거로 DDL을 별도 승인받는다.

**롤백 경계.** v2.6.0으로 되돌려도 새 컬럼·테이블은 무시되고 로그인은 계속된다(회전된 refresh도
구버전이 그대로 찾는다). 다만 구버전은 `auth_version`을 보지 않으므로, 비밀번호 변경 직후 남아 있던
access 토큰이 만료(최대 30분) 전까지 다시 통과한다 — 보안 회귀이므로 롤백은 사고 절차로만 한다.
탈퇴 뒤 `oauth_unlink_task`에 남은 작업은 구버전이 처리하지 않으므로 롤백 전에 미결 건수를 확인한다.

## 4. 통합 메시지·신고: 배포 전후 확인

통합 메시지는 기존 `chat_room`/`chat_message`를 확장하고 `chat_report`를 새로 만든다. 첫 쓰기 전에
운영 백업·격리 복원 관문을 통과하고, 앱 기동 뒤 아래를 읽기 전용으로 확인한다.

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
  `member_blocked_at`, `owner_blocked_at`과 `(store_id,type,last_message_at)` 인덱스를 확인한다.
- 기존 고객지원 enum 문자열은 `SUPPORT`, 가게 문의는 `STORE`다. 이미 저장될 수 있는 `STORE`를
  문서 이름에 맞추려고 `STORE_CHAT`으로 바꾸지 않는다.
- `chat_message`의 `(room_id,sender_member_id,client_message_id)` unique와 `(room_id,id)` 인덱스를 확인한다.
- `sender_role`은 `ADMIN`/`MEMBER`/**`OWNER`** 세 역할을 저장할 수 있어야 한다.
  기존 native ENUM은 `ddl-auto`가 새 상수를 자동 반영한다고 기대하지 않는다. health 200으로도 발견되지 않는다.
  후보 스키마 검사(`RESERVE_VERIFY_PREVIEW_SCHEMA=1`)는 OWNER가 없는 ENUM을 실패시킨다.
- `chat_report.report_key` unique, `(status,created_at)`과 `(room_id,created_at)` 인덱스를 확인한다.
- 기존 `SUPPORT` 방의 `owner_unread`가 0이고 차단 시각이 null인지 표본 확인한다. 본문은 운영 점검
  출력에 복사하지 않는다.
- 제약이나 기본값이 다르면 즉시 ALTER하지 말고 `SHOW CREATE TABLE` 결과로 별도 DDL을 승인받는다.

---

## 5. `reservation.checked_in_at` 시간대 백필 (KST → UTC)

기존 QR 체크인은 `ServiceTime.now()`로 한국 시각을 저장했지만 같은 행의 감사 시각은 운영 JVM 기준
UTC로 저장됐다. 새 코드는 체크인도 UTC로 저장하고 응답에서 한국 시각으로 바꾸므로, 기존 KST 행은
배포 뒤 그대로 두면 화면에서 9시간 뒤로 보인다.

체크인 트랜잭션은 `updated_at`도 UTC로 갱신한다. 따라서 `checked_in_at > updated_at`인 행은
확실한 KST 저장분이며, 9시간을 빼면 조건이 다시 참이 되지 않아 아래 UPDATE는 재실행해도 안전하다.

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

체크인 뒤 9시간이 지나 다른 수정이 있었던 기존 행은 위 조건에 잡히지 않을 수 있다. 컷오버 전 행을
별도로 조회해 표본 확인하고, 남은 KST 행은 식별한 id에 한해서만 9시간을 뺀다. 운영 적용과 표본 확인은
배포 승인 창에서 수행하며, 이 문서 변경만으로 적용된 것으로 기록하지 않는다.

---

## 이력

### 2026-09-27 운영 읽기 전용 대조 (DDL 미실행)

StrictHostKeyChecking으로 연결한 운영 MySQL **8.0.45·28테이블**, blue upstream과 현재 프론트
`b478ae8d732afa1e35642d790bfc39972556f885`를 확인했다. 서버의 ECDSA 지문은 CI pin과 일치한다.

| 구분 | 실제 운영 상태 | 통합 후보에서 필요한 차이 |
|---|---|---|
| 광고 | `ad_payment_attempt`·`advertisement` 존재, status VARCHAR(20), title VARCHAR(100), description VARCHAR(300) | 원장/제목/내용 재생성 불필요. nullable `banner_motion VARCHAR(24)` 없음 |
| refresh/출석 | previous_token_hash VARCHAR(64), rotated_at·checked_in_at DATETIME(6), refresh previous hash index 존재 | 기존 회전 구조 재생성 불필요. 출석 시간대 백필 대상은 별도 조사 |
| 채팅방 | SUPPORT/STORE·store_id·member_id·기존 2개 목록 index 존재 | store_name_snapshot·owner_unread·last_message_preview·member/owner_blocked_at 및 store/type/recent index 없음 |
| 메시지 | content TEXT NOT NULL·sender_member_id·room/id index 존재 | client_message_id·idempotency unique/index·사진 nullable 5컬럼 없음 |
| 역할 | sender_role ENUM('ADMIN','MEMBER') NOT NULL | **OWNER 추가 수동 DDL 관문** |
| 안내/신고 | chat_report·chat_intro·chat_intro_item 없음 | 새 테이블·unique/FK/index를 격리 MySQL에서 검증하고 배포 승인에 포함 |

아래는 **현재 타입을 다시 확인한 뒤 별도 승인할 제안**이며, 이번에는 실행하지 않았다.
기존 ADMIN/MEMBER 값은 보존하고 OWNER만 추가한다. 배포 전 다른 값/타입이 발견되면 이 SQL을 그대로 적용하지 않는다.

```sql
SELECT COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_message' AND COLUMN_NAME = 'sender_role';

-- 백업 가용성/격리 검증/별도 승인 뒤, 새 STORE 답장 첫 쓰기 전에 실행할 제안
ALTER TABLE chat_message
  MODIFY COLUMN sender_role ENUM('ADMIN','MEMBER','OWNER') NOT NULL;
```

새 필수 `owner_unread`는 기존 행이 0이 되도록 기본값/백필을 명시해 검증한다. nullable 컬럼 추가와 달리
`INT NOT NULL` 추가를 빈 H2 테이블에서 통과했다고 기존 운영 행까지 안전하다고 판단하지 않는다.
실제 ADD/CREATE/UNIQUE·역호환·DDL 잠금 시간은 별도 MySQL 관문이며, 기존 28테이블을 통째로 재구성하지 않는다.

### 2026-09-27 채팅 사진 후보 (운영 미적용)

기존 `chat_message`에 nullable 컬럼 5개를 추가한다. `ddl-auto`가 추가할 수 있으나 컷오버 전
MySQL `SHOW CREATE TABLE`로 기존 타입·기본값을 확인하고 실제 실행할 ADD만 승인받는다.

| 컬럼 | 타입 | 기본값 |
|---|---|---|
| `image_key` | VARCHAR(512) | NULL |
| `image_content_type` | VARCHAR(40) | NULL |
| `image_width` / `image_height` / `image_bytes` | INT | NULL |

기존 텍스트는 NULL 유지, 사진 메시지의 빈 캡션은 빈 문자열이며 `content` NOT NULL을 변경하지 않는다.
`uk_chat_message_idempotency`와 기존 room index를 유지한다. 새 테이블·FULLTEXT 활성화·기존 컬럼 삭제는 이 변경에 없다.
DB 복원만으로 사진이 복구되지 않으므로 기존 이미지 S3 객체와 보호된 암호화 키도 함께 복구 가능해야 한다.

### 2026-09-27 채팅 숨김·신고 증거·90일 파기 후보 (운영 미적용)

추가 DDL은 [채팅 계약](chat-controls.md)의 컬럼/테이블과 대조한다. 기존 신고는 자동 backfill하지 않는다.
`chat_report_evidence`는 report/message별 unique, 사진 key index를 두고, 감사 원장은 report/time index를 둔다.
두 테이블은 원장 보존을 위해 메시지 삭제 cascade를 갖지 않는다. 원문·키 값은 DDL 실행 로그에 출력하지 않는다.

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

운영 실행 전 `SHOW CREATE TABLE`에서 컬럼/인덱스 존재 여부를 재확인한다. 추가 테이블의 정확한 DDL은
위에 기록하고 후보 엔티티 및 외부 기능 manifest와 대조한다. H2 성공으로 MySQL 성공을 대체하지 않는다.
9/27 격리 MySQL 8.0.45에서는 기존 백업+DDL 33테이블·일반 파기/증거 유지/감사 INSERT가 통과했다.
검사 DB만 제거했으며 운영 실행 증거는 아니다. 추가 DDL 해시는 외부 실행 manifest에 보존한다.
파기 worker는 `CHAT_RETENTION_ENABLED=false`가 기본이며, 기존 신고 보류/개인정보 고지/기존 백업의
원문 잔존/이전 화면 호환성까지 검증한 뒤 별도로 켠다. 일반 백업을 새로 설치하거나 S3/IAM을 재구성하지 않는다.

### 날짜별 이력

| 날짜 | 대상 | DDL | 적용자 | 메모 |
|---|---|---|---|---|
| _(미적용)_ | `store` | `ft_store_search` FULLTEXT | | 적용 후 `fulltext-enabled: true` |
| _(미적용)_ | `store` | `idx_store_public_location` BTREE | | 별도 MySQL 8 `EXPLAIN ANALYZE` 후 적용 |
| _(미적용)_ | `reservation` | `checked_in_at` KST→UTC 백필 UPDATE | | §5. 새 백엔드 전환 직후 |
| _(미적용)_ | `chat_message.sender_role` | 기존 ENUM에 OWNER 추가 | | 9/27 읽기 전용으로 ADMIN/MEMBER만 확인. 새 STORE 답장 전 별도 승인 |
