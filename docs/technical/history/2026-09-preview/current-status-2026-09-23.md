# RESERVE 현재 상태

기준일: **2026-09-23 KST**  
기준 작업공간: `local-preview-all-changes`의 혼합 프리뷰

이 문서는 기능 존재 여부와 운영 완료 여부를 섞지 않기 위한 상태 정본이다. 실제 동작을 판단할 때는
**현재 코드와 이번에 실행한 검사**가 우선한다. 날짜가 붙은 handoff, 프리뷰 기록, README, 스킬은
맥락 또는 과거 증거이며 현재 운영 증거가 아니다.

## 상태 읽는 법

| 상태 | 의미 |
|---|---|
| 코드 존재 | 현재 로컬 작업트리에 구현이 보인다. 미커밋 신규 파일도 포함하므로 Git에 보존됐다는 뜻은 아니다. |
| 로컬 검증 | 표시한 검사 범위가 현재 로컬 코드에서 통과했다. MySQL·PG·S3·실제 브라우저·운영을 대신하지 않는다. |
| `dev` 병합 | 해당 변경이 원격 `dev`에 병합됐다는 현재 증거가 있다. 로컬 브랜치 이름이나 과거 PR 계획만으로는 `예`가 아니다. |
| production 배포 | 해당 변경이 `reserve.it.kr`의 배포 아티팩트에 포함됐다는 증거가 있다. HTTP 200만으로는 SPA 라우트 배포를 증명하지 않는다. |
| 외부 실증 | MySQL, PortOne, S3, OAuth 제공자, Loki, 실제 계정·기기 등 외부 경계에서 시나리오를 확인했다. |

표의 `부분`은 일부 하위 기능이나 일부 검사만 확인했다는 뜻이다. `미확인`은 실패가 아니라 최신 증거가
없는 상태다.

## 릴리스 기준선

- 확인된 운영 릴리스는 **v2.5.1**이다.
- 현재 로컬의 v2.6 변경은 `dev` 병합·production 배포 증거가 없다.
- `frontend/package.json`과 `backend/build.gradle`의 버전은 아직 `2.5.0`이다. 통합과 승인 관문을 모두
  통과한 뒤에만 CHANGELOG와 함께 `2.6.0`으로 맞춘다.
- 현재 브랜치는 감사 시점에 `origin/dev`보다 **ahead 1 / behind 27**이고, 수백 개의 tracked·untracked
  변경이 섞여 있다. 이 상태 자체는 릴리스 후보가 아니다.

## 기능 상태표

| 기능 묶음 | 코드 존재 | 로컬 검증 | `dev` 병합 | production 배포 | 외부 실증 |
|---|---|---|---|---|---|
| v2.5.1 운영 기준선 | 예 | 현재 v2.6 전체와 별개 | 과거 릴리스 계보 | 예 | 부분 — 배포·health 과거 기록 |
| 계정·세션 수명주기(`authVersion`, `sessionRevision`, 비밀번호 변경, OAuth unlink outbox) | 예 | 부분 — 단위·통합 테스트 | 미확인 | 아니요 | 아니요 |
| cookie-only `/api/auth/refresh` 계약 | 예 — 기존 HttpOnly refresh cookie를 검증·유지하고 새 HttpOnly access cookie만 설정, 본문은 `ApiResponse<Void>` | 예 — MVC 속성·만료·본문 token 부재·refresh 미재발급 계약 | 아니요 | 아니요 | 아니요 |
| 결제 상태 재확인·환불 원장·동시성 안전장치 | 예 | 예 — 로컬 백엔드 테스트 | 미확인 | 일부 기반만 v2.5.1 | 아니요 — TEST PG·운영 MySQL 필요 |
| 광고 결제·예약 전환 귀속 | 예 | 부분 — 로컬 테스트 | 아니요 | 아니요 | 아니요 |
| 광고 공개 지표 유효성·flush 복구·내 광고 페이지네이션 | 예 | 예 — 공개 no-op·limiter/IP·무효 광고·flush 복구·Page 저장소 테스트 | 아니요 | 아니요 | 아니요 |
| 광고 작성 2단계 미리보기·추천/직접 문구·선택 모션 단독 재생·탭 URL 정리 | 예 — 추천으로 제목/내용을 채운 뒤 수정 가능; 실제 표면 확인 후 마지막에 결제; 단계별 스크롤 초기화·공통 footer/RefreshButton·모달 레이어 적용 | 예 — 서버 문구 경계 테스트·변경 파일 lint/PostCSS·PC/모바일 mock 브라우저 | 아니요 | 아니요 | 아니요 |
| QR 소유권·승인 예약 제한·`checkedInAt` 출석 기록 | 예 | 예 — 로컬 테스트 | 미확인 | 기반 기능만 v2.5.1 | 부분 — 기존 운영 DB 시간대 백필은 미실행 |
| 통합 메시지·가게 문의·신고·차단 | 예 | 부분 — 로컬 테스트 | 아니요 | 아니요 | 아니요 — 실제 두 계정 필요 |
| 독립 `/search`, 지역·분야·추천 탐색 | 예 | 부분 — 로컬·mock 브라우저 | 아니요 | 아니요 | 아니요 |
| 검색 DB predicate·페이지네이션·거리 후보 제한 | 예 | 부분 — H2 표적 테스트 통과, MySQL 8 검증 필요 | 아니요 | 아니요 | 아니요 |
| 공개 가게 소식 `/benefits` | 예 | 예 — 프론트 테스트 | 아니요 | 아니요 | 아니요 |
| 지역 관광 사진 API·same-origin 프록시 | 예 | 부분 — 로컬 응답·fallback | 아니요 | 아니요 | 아니요 |
| 관광 프록시 HTTPS·redirect·8 MiB streaming 경계 | 예 | 예 — 초과·MIME·HTTP·외부 redirect·timeout·fallback 테스트 | 아니요 | 아니요 | 아니요 |
| `/operation-guide`, `/content-sources`, sitemap·SEO | 예 | 예 — 로컬 라우트·테스트 | 아니요 | 아니요 | 아니요 — 운영 200은 현재 SPA fallback |
| PC·모바일 공통 뒤로가기와 지연 라우트 골격 | 예 | 예 — 원 실패 2건을 PC·모바일 각 10회(40/40), discovery 전체 10/10 통과 | 아니요 | 아니요 | 아니요 |
| SHA별 프론트 staging + 백엔드 health 후 동시 nginx 전환 | 예 — 로컬 워크플로 변경 | 정적·로컬 스크립트만; Actions 미실행 | 아니요 | 아니요 | 아니요 — 실제 rollback 훈련 필요 |
| 문서 링크·불변 디자인 snapshot CI 관문 | 예 | 예 — Markdown 60개/로컬 링크 327개, snapshot 108/108·ZIP 해시 일치 | 아니요 | 아니요 | 해당 없음 |
| 백업·격리 복원·S3/IAM·cron | 스크립트·런북만 보존 | 구문 수준만 | 미확인 | 미구성 — 추가 AWS·cron 설정을 하지 않기로 결정 | 아니요 |
| CSP Report-Only 수집 | 코드·설정 존재 | 로컬 validator | 일부 기반 배포 | 수집 경로 불완전 | 아니요 — 정상 `{job="reserve"}` 7일 필요 |

## 2026-09-23 로컬 검증 결과

- 백엔드: `gradlew clean test` **100 suites / 474 tests**, 실패·오류·skip 0. `gradlew build -x test` 패키징도 통과했다.
- 프론트: lint, 정책 테스트 **7/7**, Vitest **92 files / 798 tests**, 의도된 sitemap 생성을 포함한
  `npm run build`와 bundle budget을 통과했다. 최대 JS 청크는 **577.7 KiB**로 600 KiB 예산 안이다.
- CSS·관측성: PostCSS가 CSS 13개를 파싱했고 Grafana dashboard validator가 통과했다.
- 브라우저: 원래 실패했던 두 라우팅 사례를 PC·모바일에서 각각 10회 반복해 **40/40**, discovery spec
  전체 **10/10**, 최종 Playwright 전체는 **113 passed / 3 device-only skipped / 0 failed**였다.
- 문서·보존본: Markdown 60개에서 로컬 링크 327개를 확인했고, immutable snapshot은 **108/108**과
  ZIP payload·SHA-256 무결성이 일치했다.
- README 합성 자산: 실제 React 화면 5장과 합성 모니터링·아키텍처 2장을 1600×900으로 만들었고,
  연속 2회 생성 SHA-256 **7/7 일치**, 개인정보·`undefined`·`NaN` guard와 PNG metadata 검사를 통과했다.
- 광고 작성 후속: 변경 파일 lint, 홈·모션·URL 표적 Vitest **27/27**에 이어 날짜·모션 표적 **4/4**,
  광고 작성의 배지·배너 미리보기와 공통 모달 footer를 Chromium PC·모바일에서 **2/2** 확인했다.
  직접 문구 저장·추천 fallback·공백/길이/잘못된 키·금액 분리를 백엔드 `AdvertisementBoundaryTest`로 확인했고,
  단계 스크롤 초기화·공용 재생 버튼·모달/메신저 레이어 우선순위를 PC·모바일에서 다시 **2/2** 확인했다.
  변경 파일 lint, PostCSS 파싱과 `npm run build`·bundle budget을 통과했다. 전체 suite는 이 후속에서 재실행하지 않았다.
- 노출형 후속: `BADGE` 내부 값은 유지하고 사용자 문구·실제 카드/리스트 미리보기를 통일했다. 검색 결과에서
  노출형 우선순위를 모든 정렬에 적용하고, 백엔드 `StoreSearchOrderingTest`·`StoreFulltextRoutingTest`,
  카드/리스트 Vitest **35/35**, 광고 작성 Playwright PC·모바일 **2/2**, 변경 파일 lint,
  CSS 파싱, `npm run build`·bundle budget을 확인했다. MySQL 8 FULLTEXT 네이티브 쿼리 실증은 아직 없다.
- 위 결과는 혼합 프리뷰 작업공간의 로컬 증거다. MySQL 8, GitHub Actions, Linux 실전 rollback,
  PortOne TEST, S3, Loki, 실제 Safari·계정·운영 배포 증거를 대신하지 않는다.

## 현재 코드로 확정한 계약

- 뒤로가기 버튼은 하위 화면에서 **PC와 모바일 모두** 공통 Header가 제공한다.
- 혜택은 `/api/promotions/public`에서 읽는 공개 **가게 소식**이다. 기존 유료 광고 상품
  `BADGE`·`BANNER`와 같은 권리가 아니며 쿠폰 발급·사용 기능도 아니다.
- 광고 `BANNER`는 현재 `/stores`에서 렌더되는 고정형 플로팅 위젯이다.
- 광고 `BADGE`는 화면상 **노출형**으로 부른다. 가게 목록의 카드·리스트에 작은 `광고` 표기를 붙이고,
  검색·분야·지역 필터를 적용한 결과에서 모든 정렬 방식보다 먼저 우선 노출한다. 내부 enum은 호환성을 위해 유지한다.
- 배너 추천 문구는 시작값이며 최종 제목·내용은 각각 100자·300자 안에서 수정할 수 있다. 서버는 둘을 함께
  검증·공백 정규화한 뒤 저장하고, 한쪽 누락·길이 초과·알 수 없는 추천 키를 업로드 전에 거부한다.
- 미결 예약·광고·환불·결제 확인·웹훅이 남은 가게 삭제는 `DataLifecycleGuard`가 **409로 차단**한다.
  확인 모달은 서버 차단을 우회하지 않는다.
- 검색 입력은 독립 `/search` 화면을 거쳐 `/stores` 결과로 연결된다.
- 기본 가게 카드 이미지는 저장된 `width`·`height`를 실제 `<img>` 속성으로 전달하고 `height: auto`로
  원본 비율을 예약한다. 4:3 강제 계약이 아니다. 별도 목록형·추천형 썸네일의 1:1 면은 다른 컴포넌트 계약이다.
- 결제 상태 재확인, 광고 전환, QR 예약자 소유권 검사, 프론트 `sessionRevision` fencing은 이미 코드에 있다.
- QR 체크인은 예약 상태를 자동 승인하지 않고 승인 상태를 확인한 뒤 `checkedInAt`만 기록한다.
- 로컬에는 `/operation-guide`와 `/content-sources`의 고유 컴포넌트·SEO·sitemap 항목이 있다. 현재 운영
  URL의 일반 200 응답은 그 고유 본문이 배포됐다는 증거가 아니며 SPA fallback과 구분해 확인해야 한다.

## v2.6 승인 관문

1. 현재 작업트리를 rebase/reset하지 않고 최신 `origin/dev`의 깨끗한 통합 공간으로 기능별 manifest를
   이용해 옮긴다. 이 단계도 현재 대화의 별도 Git 승인이 필요하다.
2. 혼합 프리뷰에서는 변경별 표적 검사와 백엔드 전체, lint, Vitest, 정책 검사, `npm run build`, 번들 예산,
   PostCSS, Grafana validator, Playwright 전체를 통과했다. 기능별 이식 후 깨끗한 통합 후보에서 동일 관문을
   다시 실행한다.
3. MySQL 8에서 pagination·거리 정렬·FULLTEXT·DDL·locking을 검증한다. H2 통과를 운영 증거로 쓰지 않는다.
4. 운영 백업용 AWS·IAM·S3·cron은 비용을 늘리지 않기 위해 이번 범위에서 구성하지 않는다. 기존
   스크립트·런북은 비용을 발생시키지 않는 비활성 자료로 보존한다. 이 선택은 복구 가능성을 증명하지
   않으며, 백업 없이 스키마를 변경하면 데이터 손실 위험을 수용한 것으로 별도 기록해야 한다.
5. PortOne TEST, 격리 S3 outbox, 실제 계정 session fencing·메시지 신고/차단, Safari와
   320/375/768/1440 화면을 확인한다.
6. 배포 후 두 공개 문서는 고유 본문과 sitemap으로, 관광 사진·로그아웃·메시징·결제 복구는 실제
   환경에서 확인한다. rollback·TEST PG·S3·MySQL 증거 중 하나라도 없으면 운영 검증 완료가 아니다.
   백업은 의도적으로 미구성이라고 표시하며, 백업·복원 검증 완료로 표현하지 않는다.

커밋, 브랜치 생성, PR, merge, tag, 배포, GitHub 설정, 운영 쓰기는 각각 현재 대화의 별도 승인을 받는다.
