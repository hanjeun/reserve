# 채널톡형 광고 표현과 저장소 도입 검토

> 2026-09-13 `local-preview-all-changes` 로컬 프리뷰 기준.
> 구현: 메신저 런처의 흰 배경·브랜드 블루 아이콘/X와 선택형 사진 표시.
> 제안: 광고 UI, 노출 정책, 새 저장소. 아래는 승인된 ADR이나 운영 병목 진단이 아니다.
> 광고·과금·집계·DB·인프라는 수정하지 않았고 통합·배포하지 않았다.

## 1. 참고 범위와 제품 경계

[채널톡 공개 홈](https://channel.io/kr)의 실제 플로팅 소개 카드·사진 런처와
[고객 메신저](https://channel.io/kr/user-chat), [마케팅 소개](https://channel.io/kr/marketing)를 확인했다.
로그인 후 관리자/캠페인 제작 화면까지 DOM/CSS를 실측한 것은 아니다. 외부 SDK·사진·브랜드·CSS를
복사하지 않고 RESERVE의 색상·모션·접근성 계약 안에서 작은 소개 카드와 명료한 동작을 참고한다.

현재 광고는 `BADGE`와 `BANNER` 유료 가게 노출이다. `StoreList`는 활성 BANNER를 조회하고
`AdBanner`는 첫 광고의 원본 비율 사진, 가게 링크, 닫기, 노출/클릭 기록을 제공한다.
메신저의 `SUPPORT`/`STORE` 대화, 향후 선제 안내/CRM 캠페인, 유료 가게 광고는 서로 다른 제품이다.
광고를 실제 채팅 말풍선이나 가짜 unread 배지로 표시하지 않는다.

코드 근거: `frontend/src/components/advertisement/AdBanner.jsx`,
`frontend/src/pages/StoreList.jsx`, `backend/src/main/java/kr/it/reserve/advertisement/entity/AdType.java`.

## 2. 광고 UI 제안 — 아직 구현하지 않음

방향은 적합하다. 다만 광고 전체를 상담 위젯으로 바꾸기보다 **작은 가게 소개 카드**로 제안한다.

| 항목 | 제안 | 보존할 경계 |
|---|---|---|
| 카드 | 흰/테마 paper 면, 기존 radius·중립 그림자, 짧은 제목·소개·하나의 주 동작 | 파란 hover 글로우나 전역 상태색 교체 없음 |
| 출처 | `광고 · 가게명`과 실제 가게로 가는 `가게 보기` | 상담원이 말을 걸었다고 오인시키지 않음 |
| 사진 | 가게/브랜드 소유 사진을 선택적으로 사용 | 기존 BANNER 업로드의 원본 비율·크롭 금지 유지. 작은 티저용 사진은 별도 승인 |
| 닫기 | 명료한 X, 키보드 동작, 최소 44px 터치 목표 | 닫기와 캐러셀 조작을 광고 클릭으로 집계하지 않음 |
| 위치 | 플로팅 영역 조정 관문 하나에서 광고와 메신저 우선순위 결정 | 둘 다 우하단을 쓰는 현재 CSS 중첩 가능성부터 해소. 임의 bottom 보정 누적 금지 |
| 모바일 | 짧은 소개 카드 또는 목록 안 광고 배치 중 선택 | 작은 화면의 예약 CTA·키보드·메시지를 가리지 않음 |
| 노출 빈도 | 닫기·재노출·페이지별 노출 조건을 먼저 합의 | private 채팅으로 타기팅하지 않음. 추적/마케팅 동의와 보존 정책 별도 검토 |

메신저가 열려 있거나 사용자가 대화/예약을 수행하는 동안에는 해당 동작이 광고보다 우선한다.
같은 안내를 런처 위·본문·메뉴에 중복해서 띄우지 않는다. 지원 소개 티저와 유료 광고는 제목/출처로 구분한다.

### 집계와 결제는 UI와 별도 설계

- 현재 `AdBanner`의 impression은 컴포넌트 mount 시 해당 광고에 한 번 전송하는 값이다.
  실제 화면에 일정 시간 보였다는 viewability 증거는 아니다. 위치 변경과 동시에 기존 집계 의미를 몰래 바꾸지 않는다.
- 새 노출 정의가 필요하면 별도 버전/이벤트로 설계하고 클릭·닫기·슬라이드 이동을 분리한다.
  한 번의 가게 진입은 한 번의 클릭/attribution 기록만 발생해야 한다.
- 광고 관리의 심사·결제·활성·만료·취소/환불 조건은 서버와 기존 금융 모델을 따른다.
  채널톡형 외형을 이유로 결제/정산 모델이나 타깃 조건을 새로 만들어 붙이지 않는다.
- 첫 배치는 fixture 시안 → PC/모바일 겹침·닫기·이미지 원본·단일 클릭 확인 → 사용자 확인 순서다.
  실제 광고 UI/데이터 변경은 이 제안과 별도 구현 배치로 진행한다.

## 3. 이번에 구현한 메신저 런처

- 배경은 라이트·다크 모두 흰 면이다. 전경은 `--c-messenger-launcher-fg`의 기본값인
  `--c-primary-dark`를 사용한다. 기본 블루 테마에서 라이트 `#2272eb`, 다크 `#3182f6`이며
  다른 사용자 포인트색을 전역에서 강제로 블루로 되돌리지 않는다.
- PC 56×56px/radius 16px, 모바일 48×48px/radius 14px의 기존 치수다.
  hover 2px 들림·active scale .93·중립 그림자·focus-visible·reduced-motion 계약을 유지한다.
- `MessengerShell`에 선택형 `launcherImageSrc`를 추가했다. 기본은 메시지 아이콘이며
  PC 패널이 열리면 사진 대신 X를 표시하고 닫히면 사진/아이콘으로 돌아온다.
- 사진 로드 실패는 메시지 아이콘으로 복귀한다. src가 바뀌면 실패 상태를 재설정한다.
  사진은 장식이며 버튼의 기존 접근성 이름·unread·PC 패널/모바일 `/messages` 진입은 그대로다.
- 현재 App은 사진을 지정하지 않는다. 관리자가 사진을 업로드/저장하는 설정 기능을 만든 것은 아니다.
  향후 소유권을 확인한 정적/CDN 자산을 연결하고 CSP·외부 요청 정책도 확인한다. 임의 사용자 URL 입력 기능은 없다.

개발 연결 예시(아래 파일이 존재한다는 뜻이 아님):

```jsx
<MessengerShell launcherImageSrc="/icons/support-team.webp" />
```

이번 실측은 인증/API를 실행하지 않는 [개발용 시각 미리보기](../../../../frontend/design-previews/messenger-launcher.html)다.
실제 `MessengerLauncherVisual`과 글로벌 CSS를 사용했다. 원래 앱은 비로그인 상태라 런처가 숨겨져 있었고,
사용자 인증 상태를 조작하지 않았다. 로그인된 실제 패널의 E2E 증거로 이 캡처를 사용하지 않는다.
[PC·모바일 캡처와 실측 기록](../../../design-system/visuals/2026-09-13-messenger/README.md)을 별도로 보존한다.
기존 디자인 시스템 동결 스냅샷은 수정하지 않는다.

## 4. 저장소 결정 제안

### Context

`backend/build.gradle`에는 JPA·MySQL Connector·Bucket4j core·로컬 테스트용 H2가 있다.
Redis·문서·그래프·벡터·검색엔진 클라이언트 의존성은 해당 파일에 없다.
채팅 본문·방 요약·unread와 전송 멱등 키는 MySQL 트랜잭션/인덱스로 관리하며,
파일 삭제·OAuth unlink outbox와 결제 웹훅 inbox도 MySQL에 있다.
현재 서버 여유 메모리·트래픽·DB 크기·검색 지연·운영 query plan은 조사하지 않았다.

### Proposed decision and alternatives

**지금은 MySQL을 정본으로 유지한다.** 기능을 확장했다는 사실만으로 저장소를 추가하지 않는다.

| 후보 | 현재 판단 | 도입 조건과 대가 |
|---|---|---|
| MySQL | 유지 | 예약/결제/권한/채팅을 현재 트랜잭션 모델로 관리. 운영 durability는 DB/인프라 설정 확인과 별도 |
| 프로세스 메모리 | 이미 사용 | `RateLimiter`의 ConcurrentHashMap과 광고 LongAdder 버퍼. 재시작·프로세스 간 공유/영속성을 제공하는 DB가 아님 |
| Redis | 우선 검토 후보지만 지금 보류 | 동시 서비스 인스턴스 간 공유 제한·ephemeral 상태 또는 측정된 캐시 효과가 필요할 때. 원자성·TTL·eviction·장애 정책·RAM·복구 책임 추가 |
| 검색엔진 | MySQL 개선 뒤 조건부 | 오타/자동완성/facet/ranking 요구 또는 측정된 검색 한계. MySQL→파생 인덱스 동기화·삭제 전파·재색인·지연 관측 필요 |
| 문서 DB | 현재 근거 없음 | 채팅이라는 이유만으로 MongoDB로 옮기지 않음. 별도 문서 중심 aggregate가 생길 때 재검토. 복수 저장소/트랜잭션·배포 부담 추가 |
| 그래프 DB | 현재 근거 없음 | 단순 favorites 관계는 현재 SQL로 처리. 다단계 관계 탐색이 핵심이고 SQL의 측정된 한계가 있을 때 재검토 |
| 벡터 저장소 | AI/RAG 후속 검토 | 승인된 공개 FAQ·가게 정책의 의미 검색이 실제 품질을 개선할 때. ACL·embedding 버전·삭제/재색인·평가·비용 책임 추가. pgvector는 PostgreSQL용이라 현 MySQL 확장이 아님 |

MySQL 트랜잭션: [InnoDB ACID](https://dev.mysql.com/doc/refman/8.0/en/mysql-acid.html).
Redis: [원자적 제한기 패턴](https://redis.io/docs/latest/commands/incr/),
[eviction](https://redis.io/docs/latest/develop/reference/eviction/),
[persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
검색: [Meilisearch typo 설정](https://www.meilisearch.com/docs/reference/api/settings/update-typotolerance),
[비동기 indexing](https://www.meilisearch.com/docs/capabilities/indexing/tasks_and_batches/async_operations).
문서/그래프/벡터: [MongoDB 트랜잭션](https://www.mongodb.com/docs/manual/core/transactions/),
[트랜잭션 배포 조건](https://www.mongodb.com/docs/manual/data-modeling/enforce-consistency/transactions/),
[Neo4j 모델](https://neo4j.com/docs/getting-started/appendix/graphdb-concepts/),
[pgvector 공식 README](https://github.com/pgvector/pgvector).

### 새 DB보다 먼저 검토할 코드

1. **전체 결과 로딩:** `StoreService.sortedSearch`는 domain/유효한 거리 정렬 시
   `Pageable.unpaged()`로 전체 일치 결과를 읽고 Java 필터/정렬 뒤 페이지를 자른다.
   페이지네이션 UI가 있다고 DB 조회도 제한되는 것은 아니다. domain backfill/DB 조건과 거리 후보 범위 제한부터 검토한다.
2. **검색 인덱스:** FULLTEXT 경로는 코드에 있으나 기본 flag는 false이고 prod 설정은 주석이다.
   실제 운영 flag와 인덱스 존재는 미확인이다. 승인된 운영 조회 후 한국어
   [ngram FULLTEXT](https://dev.mysql.com/doc/refman/8.0/en/fulltext-search-ngram.html)의 검색 의미/실행 계획을 검증한다.
3. **광고 집계 정확도:** `AdCounterBuffer.increment`의 옛 map 참조가 swap/sum 뒤 늦게 증가하는 실행 순서와,
   `AdvertisementService.flushCounters`의 swap 뒤 DB transaction 실패에는 복구 경로가 없다.
   30초 flush 전 재시작 유실도 기존 코드가 허용한다. **정적 유실 가능성이지 실제 발생/규모 확인은 아니다.**
   정확 과금/정산 근거가 필요하면 durable event/batch ID·멱등 flush/복구부터 설계한다.
   Redis로 단순 이동해도 MySQL과의 이중 쓰기 유실/중복이 자동 해결되지 않는다.
4. **채팅 catch-up:** 기존 이력은 50건 Slice지만 `afterId` 증분 조회 List에는 repository 차원의 크기 제한이 없다.
   오래 끊긴 클라이언트의 bounded catch-up을 먼저 검토한다.
5. **외부 알림:** 기존 MySQL outbox 패턴에서 작게 시작할 수 있다. provider 멱등 키·재시도·중복 방지를 별도 설계하고
   외부 효과의 exactly-once를 약속하지 않는다.

해당 검토의 코드 경로는 각각 `store/service/StoreService.java`, `advertisement/service/AdCounterBuffer.java`,
`advertisement/service/AdvertisementService.java`, `advertisement/scheduler/AdCounterFlushScheduler.java`,
`chat/repository/ChatMessageRepository.java`, `global/ratelimit/RateLimiter.java`이며 모두
`backend/src/main/java/kr/it/reserve/` 아래다. 이번에는 이 코드를 수정하거나 백엔드 테스트를 실행하지 않았다.

### Consequences and action items

- 한 저장소 유지로 삭제/권한/트랜잭션 경계를 단순하게 유지하는 대신 고급 검색·분산 제한은 후속 작업이다.
- private 대화·신고 자료를 검색/벡터 저장소에 복제하거나 외부 embedding provider로 전송하지 않는다.
  데이터 범위·동의·신고 hold·삭제 전파·provider 보존/학습·비용 상한 결정이 선행 조건이다.
- 향후 비공개 첨부는 MySQL 권한/metadata와 private object storage가 담당한다. 문서 DB가 접근 제어를 대신하지 않는다.
- 운영 측정과 제품 요구를 확정한 뒤 가장 작은 후보 하나를 검증한다. 새 서버/DB/백업/마이그레이션은 별도 승인 대상이다.
- 광고 UI 제안과 저장소 검토를 [큰 단계 계획](roadmap-progress-2026-09-13.md)에 연결하되 구현 완료로 계산하지 않는다.

## 5. 이번 실행 확인

- `MessengerShell.test.jsx`: 명시적 4개 통과(모바일 진입, PC 닫기/focus, 사진↔X, 사진 실패 복귀).
- Shell/Visual/test/개발 미리보기 JSX ESLint: 경고 0.
- 시각 미리보기: PC 1280×720·모바일 390×844에서 실제 CSS 치수·배경/전경·가로 넘침 확인.
  테스트용 자체 R 로고가 로드됐고 없는 사진은 아이콘으로 복귀했다. viewport는 확인 후 원복했다.
- 인증된 실제 두 계정 대화·유료 광고 노출/결제·전체 테스트·프로덕션 빌드·운영 DB/서버 확인은 하지 않았다.
