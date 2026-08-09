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
--    ★ 컬럼 순서가 중요하다 — MATCH()의 컬럼 목록과 **순서까지 정확히 일치**해야 한다.
--      StoreRepository.searchStoresFulltextPaged 의 MATCH(...) 와 반드시 같게 유지할 것.
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

### 알려진 한계

- **1글자 검색은 FULLTEXT로 잡히지 않는다**(ngram 최소 2글자).
  `StoreService.searchStoreEntities`가 이 경우만 LIKE로 폴백한다.
- **BOOLEAN MODE 연산자**(`+ - > < ( ) ~ * " @`)는 `StoreService.toBooleanModeQuery`가
  공백으로 치환해 무력화한다. 이 정제를 빼면 사용자가 검색창에 `-`만 넣어도 결과가 뒤집히거나
  짝 안 맞는 따옴표로 SQL 에러(500)가 난다.
- **삭제·정지 가게 필터가 없다.** 기존 LIKE 쿼리도 마찬가지였다(`deleted_at`/`status` 조건 없음).
  같은 동작을 유지하려고 일부러 맞췄다 — 고칠 때는 두 경로를 **함께** 고쳐야 결과가 갈라지지 않는다.
- 검색 결과 정렬은 여전히 서비스 계층 인메모리 정렬이다(`sortStores`). 관련성(relevance) 순 정렬은
  적용하지 않았다 — 지금 UI가 별점·리뷰·거리순만 제공한다.

---

## 이력

| 날짜 | 대상 | DDL | 적용자 | 메모 |
|---|---|---|---|---|
| _(미적용)_ | `store` | `ft_store_search` FULLTEXT | | 적용 후 `fulltext-enabled: true` |
