# 수동 DDL 런북

`ddl-auto: update`는 **엔티티에 필드를 추가할 때 컬럼을 만들어주는 것까지만** 한다.
아래 것들은 **자동으로 반영되지 않으니 여기에 적고 손으로 적용**한다.

- 컬럼 **삭제**
- 컬럼 **타입 변경** (`VARCHAR(255)` → `VARCHAR(500)` 등)
- 제약 조건 변경 (NOT NULL, UNIQUE, FK)
- **FULLTEXT 인덱스** (Hibernate가 만들지 못한다)
- 인덱스 **이름 변경** — 새 이름으로 하나 더 생기고 옛 인덱스가 그대로 남는다

적용 원칙:
1. **적용 전에 백업.** `docs/technical/backup.md`의 `reserve-backup`을 한 번 돌린다.
2. 적용 후 이 문서의 **이력 표에 한 줄** 남긴다. 남기지 않으면 서버 재구축 때 재현할 수 없다.
3. 서버 재구축 시에는 이 문서의 DDL을 **위에서부터 순서대로** 다시 적용한다.

접속:
```bash
docker exec -it -e MYSQL_PWD="$DB_PASSWORD" mysql mysql -u root reserve
```

---

## 1. 가게 검색 FULLTEXT 인덱스 (ngram)

### 배경

`StoreRepository.searchStoresPaged`는 5개 컬럼에 `LOWER(col) LIKE '%kw%'`를 쓴다.
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

### 2026-09-07 코드 변경과 남은 확인

- LIKE와 FULLTEXT 모두 `deleted_at IS NULL AND status = 'ACTIVE'`를 적용한다. 내용 쿼리와 count 조건을 일치시킨다.
- 별점·리뷰·최신순은 **DB 전체 정렬 후 페이지**다. 동점은 `store_id DESC`로 고정한다.
- 거리순만 전체 검색 일치 집합을 가져와 거리/id 순 정렬 후 페이지를 만든다. 순서 정확성은 고쳤지만 메모리·시간 비용은 남아 있다.
- 1글자 토큰·BOOLEAN 연산자 제거 후 빈 검색어는 LIKE로 돌아간다. 정제 결과가 비었다고 원문을 BOOLEAN 연산자로 다시 전달하지 않는다.
- LIKE의 `%`·`_`·escape 문자는 문자 그대로 검색한다. FULLTEXT와 LIKE의 단어 해석이 완전히 같다는 뜻은 아니다.
- 이 코드의 짧은 토큰 분기는 `ngram_token_size=2`를 전제로 한다. 설정 변경 시 분기/테스트도 함께 바꾼다.

기본 파서와 ngram의 분절 방식은 다르며, ngram은 CJK 검색을 지원한다.
MATCH 컬럼 목록과 FULLTEXT 인덱스 정의의 일치를 확인한다.
[MySQL FULLTEXT 제한](https://dev.mysql.com/doc/refman/8.0/en/fulltext-restrictions.html),
[ngram 파서](https://dev.mysql.com/doc/refman/8.0/en/fulltext-search-ngram.html).

H2에서는 LIKE·전체 정렬·205건 페이지 경계를 확인했고, FULLTEXT는 Mockito로 호출 계약만 확인했다.
**실제 MySQL SQL 실행·인덱스·EXPLAIN 검증은 미완료**다. 운영 DDL은 실행하지 않았다.
승인된 별도 검증 DB에서 커밋된 fixture로 검색어·연산자·삭제/정지·동점·깊은 페이지와 count를 대조한 뒤 적용한다.

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

## 이력

| 날짜 | 대상 | DDL | 적용자 | 메모 |
|---|---|---|---|---|
| _(미적용)_ | `store` | `ft_store_search` FULLTEXT | | 적용 후 `fulltext-enabled: true` |
