# 품질 점검과 다음 작업

## 현재 실행 항목 — 2026-09-27

운영 기준선은 v2.6.3이다. 백업/S3/격리 복원은 이미 9/25~26 증거가 있으므로 다시 구성할 일이 아니다.
아래 9/23 검사 결과와 "백업 미구성" 판단은 과거 기록이며 현재 판단을 대신하지 않는다.
이번 수정·API/환경변수·승인 관문은 [현재 상태](current-status.md)와 [릴리스 후보 체크리스트](release-candidate-2026-09-27.md)를 따른다.

- 혼합 프리뷰 보존 manifest와 최신 dev 기준선을 고정했다. 배포된 refresh rotation 누락과 백업 export 누락을 복구했다.
- 채팅 사진, 고객지원 사진 prefix 충돌, 목록별 스켈레톤, 채팅/공지 GET 쓰기 분리, CPU 지표 분리·캐시 후보를 구현했다.
- 반복은 변경별 표적 검사로 제한한다. 전체 CI/build/브라우저 검사는 승인된 깨끗한 통합 후보에서 한 번 실행한다.
- 남은 외부 관문: MySQL/TEST PG/실제 S3·두 계정/키 보관, Linux rollback, Grafana 수신, CSP 7일 관측.
- v2.4.0·v2.4.1 Release 보완은 GitHub 쓰기 승인 후 진행한다. #110·#162는 이미 닫혔으며 의존성 PR은 별도다.

## 과거 실행 항목 — 2026-09-23 (완료 주장으로 재사용하지 않음)

대상은 `local-preview-all-changes`의 혼합 프리뷰다. production은 v2.5.1이며 이 절의 코드·검사는
`dev` 병합, v2.6 배포, MySQL·PG·S3·실제 계정 실증을 뜻하지 않는다. 기능별 배포 수준은
[현재 상태](current-status.md)를 정본으로 사용한다.

### 감사 기준선과 이번 배치의 추가 검증

| 검사 | 결과 | 경계 |
|---|---|---|
| 백엔드 전체 | 100 suites·474개 테스트 통과, 패키징 빌드 통과 | H2·mock 중심; 운영 MySQL/PG/S3 아님 |
| 프론트 정적·단위 | lint 통과, Vitest 92파일·798개, 정책 7개 통과 | 실제 기기·운영 API 아님 |
| 프론트 빌드 | sitemap을 포함한 `npm run build`, 번들 예산, PostCSS CSS 13개 파싱 통과 | 실제 배포 아티팩트·CDN 검증 아님 |
| 운영 설정 정적 검사 | Grafana validator, `git diff --check` 통과 | 운영 Grafana·서버 적용 아님 |
| Playwright 전체 | 116개 중 113 통과, 장치별 정상 skip 3개, 실패 0개 | Chromium·Pixel 7 모의 장치이며 실제 Safari·운영 API 아님 |
| 문서·snapshot 관문 | Markdown 60개/로컬 링크 327개 통과, 보존 소스 108/108·payload/ZIP 해시 일치 | 문서 의미·운영 상태를 자동 검증하지는 않음 |

표의 수치는 현재 구현 배치 뒤 2026-09-23에 다시 실행한 로컬 결과다. 깨끗한 통합 후보로 이식한 뒤에는
같은 전체 합격선을 다시 실행하며, 이 표를 MySQL·PG·S3·GitHub Actions·운영 검증으로 확대 해석하지 않는다.

문서 링크와 불변 snapshot 검증은 CI에도 연결돼 있다. snapshot 스크립트는 PowerShell 7 이상을
요구하며, 일부 파일만 재생성하거나 ZIP만 교체하지 않는다.

### P0 — 보존·배포 안전성

- 원본 작업트리는 rebase/reset/clean하지 않는다. 별도 승인 뒤 최신 `origin/dev`의 깨끗한
  `feature/v2.6-integration` 공간에 외부 file/status/SHA-256/기능 manifest로 명시한 파일만 옮긴다.
- stale `index.lock` 제거, branch/worktree 생성, stage, commit, PR, merge, tag, deploy는 각각 별도
  승인 전 실행하지 않는다.
- 프론트는 SHA 디렉터리에 staging만 한다. 비활성 backend health 뒤 새 프론트 절대 경로와 새 upstream을
  한 번의 nginx reload로 전환하고, smoke 전까지 구 조합을 유지한다. 실패 시 두 설정을 함께 복구한다.

### P1 — 릴리스 차단 구현·검증

| 순서 | 항목 | 완료 기준 |
|---:|---|---|
| 1 | 라우팅 | 정적 `RouteLoadingSkeleton`, 화면 commit을 기다리는 뒤로가기 테스트, PC·모바일 각 10회와 전체 Playwright 통과 |
| 2 | 광고 지표 | 유효 광고만 집계, 무효·제한은 200 no-op, flush 복구·중복 방지, public/인증 경계 테스트 |
| 3 | 관광 프록시 | HTTPS 전용 클라이언트, redirect 재검증·횟수 제한, 8 MiB streaming 중단, MIME/timeout/fallback 테스트 |
| 4 | 계정·QR | refresh 본문 token 제거·HttpOnly cookie 계약, 타 회원 QR 403·provider 미호출, 승인/미승인 테스트 |
| 5 | 검색·목록 | 내 광고 Page(20/최대100), 조건의 DB predicate/pageable, 거리 bounding box+DB 정렬, MySQL 8 확인 |
| 6 | 광고 작성 UX | 선택한 모션만 재생, 정보 작성 → 실제 표면 미리보기 → 결제의 2단계 흐름, 공통 모달 footer·낮은 화면 본문 스크롤, 탭 전환 시 전용 URL 키 제거 |

광고 노출은 v2.6에서 mount 기반·newest-first 의미를 유지하는 참고용 표시 지표다. 과금 증거가 아니며
공정 회전·50%/1초 viewability는 별도 버전의 지표 설계다. FULLTEXT는 MySQL DDL·EXPLAIN·LIKE
동등성 확인 전까지 flag를 끈다.

### P2 — 운영 증거

1. 추가 비용이 드는 Lightsail snapshot·S3/IAM·lifecycle/versioning·backup cron은 사용자 결정으로
   이번 범위에서 구성하지 않는다. 스크립트와 런북만 비활성 자료로 보존하며, 운영 복구 가능성이
   검증됐다고 표시하지 않는다. 백업 없이 스키마를 바꾸는 경우 데이터 손실 위험 수용을 별도 기록한다.
2. 운영 MySQL을 읽기 전용 조사하고 `checked_in_at` 백필, FULLTEXT, 광고·OAuth·채팅
   테이블/인덱스를 수동 DDL 이력과 함께 적용한다.
3. PortOne TEST 결제 복귀·PAID 복구·서명 웹훅·동시 환불 단일 PG 호출과 격리 S3 outbox
   `FAILED → COMPLETED`를 확인한다. LIVE 쓰기는 별도 승인 없이는 하지 않는다.
4. nginx → app.log → Promtail positions/labels → Loki `{job="reserve"}`를 복구한 뒤 결제·지도·Sentry를
   포함해 CSP Report-Only를 7일 관측한다.
5. 실제 계정 로그아웃/다른 탭 session fencing, 두 계정 가게 채팅·신고·차단, Safari 뒤로가기,
   320/375/768/1440 화면을 확인한다.

## 아래 내용은 날짜별 과거 증거

다음 절의 수치·원격 상태·계획은 해당 날짜의 기록이다. 현재 완료 여부나 실행 명령으로 사용하지 않는다.

## 2026-09-14 안정화와 최신 계획

조회 실패/빈 결과의 분리·사업자 수정 초기값 안전성·홍보글 현재 소유권 관문과 실제 탈퇴 준비 상태 관찰은
[최신 체크포인트](history/2026-09-preview/stabilization-progress-2026-09-14.md)에 기록한다. 최신 혜택 목표는 단순 소식 목록이 아닌
기획전 v2다. 아래 과거 검사 수치·열린 PR 표·운영 조회 결과를 이번 재실행/현재 상태로 계산하지 않는다.

## 2026-09-13 개발 우선 후속 체크포인트

현재 큰 단계와 실제 실행 범위는 [큰 단계 진행 현황](history/2026-09-preview/roadmap-progress-2026-09-13.md)을 우선한다.
공개 목록은 디자인 시스템의 12건 서버 페이지네이션으로 전환했고, 메신저 홈/대화 진입·세션 초안·
사장님 수동 문구·선택형 PC 세션 알림과 관리자 SUPPORT polling 관문을 추가했다.
외부 push·비공개 첨부·실제 AI·두 계정 대화·최신 dev 통합·운영 반영은 완료로 표시하지 않는다.

백업은 로컬 개발이나 dev 통합을 막는 선행 작업이 아니라 **첫 DB 변경 운영 배포의 필수 관문**이다.
아래 2026-09-12 운영 실행 순서는 승인된 운영 작업의 이력/런북으로 보존하며,
로컬 개발을 그 순서 뒤로 미루라는 의미로 사용하지 않는다. 이전 전체 검사 수치도 이번 재실행 결과가 아니다.

## 2026-09-12 보존 체크포인트

> 대상은 `local-preview-all-changes`의 미커밋 로컬 프리뷰다. 이 브랜치는 점검 시점에
> `origin/dev`보다 25커밋 뒤에 있으므로, 아래 통과는 최신 `dev` 통합이나 릴리스 증명이 아니다.
> 아래 수치와 판단은 당시 이력으로 보존한다. 후속 개발 순서와 실행 증거는 위 2026-09-13 절을 우선한다.

### 이번에 구현한 범위

| 영역 | 현재 로컬 프리뷰 구현 | 아직 운영 증거가 아닌 것 |
|---|---|---|
| 보안 P0 | 지도 overlay를 DOM/textContent로 만들고 inline `onclick` 제거, 기존 가게 이미지 URL을 환경·회원·가게 prefix까지 검증한 뒤에만 유지·삭제 | 운영 CSP enforcement와 과거 변조 데이터 존재 여부 |
| 가게 등록·수정 | 공통 한 달 달력으로 운영기간·임시휴무일 교체, 두 화면 모두 회색 `임시저장`, IndexedDB 1초 idle/최대 5초 자동저장·수동저장·30일 만료·복원/충돌 확인 | 다른 기기 동기화, 브라우저 저장소 영구 보존 |
| 계정 보안 | 공통 `PasswordPolicy`, signup/reset/change DTO, 현재 비밀번호 재인증, `authVersion`으로 기존 access JWT 무효화, refresh 폐기, `/agree-terms` 인증 경계 | 배포된 DB 컬럼과 실제 OAuth 제공자 응답 |
| 개인정보 생명주기 | 마케팅 동의 이력, OAuth unlink transactional outbox, 짧은 DB lease와 트랜잭션 밖 제공자 호출, 만료 lease 회수 | 운영 키 설정·기존 소셜 회원 탈퇴 실험 |
| 결제·통계 | 실제 결제일/순결제액 통계, 환불·예약금 상태 불변식 감시와 배포 후 읽기 전용 SQL | PortOne·운영 MySQL 정합성 수정이나 환불 실행 |
| 관리자 | 여러 API 중 일부 실패를 성공/빈 데이터로 숨기지 않고 출처별 실패 표시, total·라벨 의미 정리 | 운영 API 장애 주입 |
| 파일 | JPEG/PNG/GIF/WebP 실제 바이트·확장자·MIME·크기·픽셀 제한, 표준 이미지는 실제 디코딩, WebP는 RIFF/chunk/프레임 구조 검사 | WebP 코덱을 이용한 전체 픽셀 디코딩·악성코드 검사 |
| 접근성·SEO | 차트 텍스트 요약/데이터 표, 홈 `h1` 하나와 섹션 `h2`, 달력의 이름 있는 dialog, 기존 private route `noindex` 계약 보존 | 아직 운영 응답에는 private 경로 `X-Robots-Tag`가 없음 |
| 앱형 탐색 v1 | 검색 → 운영 공지 → 서비스 도메인 → 추천 가게 IA, 별도 `serviceDomain`과 bounded notice highlights API | 운영 데이터의 분류 품질·노출 성과, 도메인 분리 |
| 통합 메시지 | desktop panel/mobile `/messages`, 고객지원·가게 문의·사장님 inbox, 분리 unread, client ID 멱등성, cursor history, 늦은 응답 fencing, 양방향 차단·신고·관리자 처리 근거 | 실제 두 계정 장시간 대화, 보존 hold 기간·외부 알림·첨부·AI |
| 운영 준비 | 백업 S3/IAM/lifecycle 설계, 충돌 덮어쓰기 방지 백업·격리 DB 복원 스크립트, 배포 후 읽기 전용 확인 항목 | S3/IAM 생성, 서버 설치, cron, 첫 백업, 복원 훈련, 외부 성공시각 알림 |

가게 초안은 자동 로컬 저장을 기본으로 하고 `임시저장` 버튼도 함께 둔다. 이탈 순간에만 묻는 모달은
모바일 브라우저가 표시를 보장하지 않고 반복 이탈 때 피로가 크다. IndexedDB는 File/Blob을 보관하면서
키 입력마다 MySQL/S3 write를 만들지 않으므로 현재 규모의 비용·복구 균형에 가장 적합하다.
세부 계약은 [가게 임시저장](store-drafts.md), 계정 경계는 [계정 보안](account-security.md),
메시지 권한·확장 관문은 [통합 메시지](messaging.md), 백업 적용 순서는 [백업·복구 런북](backup.md)에 둔다.

### 최신 실행 증거

| 검사 | 2026-09-12 결과 | 한계 |
|---|---|---|
| Backend 전체 | 84 suites, **327 tests 통과**, 실패·오류·skip 0 | 운영 MySQL·OAuth 제공자·PortOne 미접속 |
| Frontend Vitest | 21 files, **59 tests 통과** | 모든 브라우저 저장공간 회수 조건은 아님 |
| Playwright PC·모바일 | 최종 전체 **40/40 통과**(8분 30초). 앱형 홈 fixture 수정 뒤 인접 critical flows도 **14/14 재통과** | mock API 기반이며 실제 결제·카메라가 아님 |
| ESLint | 통과 | 서버 데이터 의미는 증명하지 않음 |
| Production build·bundle budget | 통과, initial 319.4 KiB gzip, 최대 JS 557.9 KiB | 실제 저사양 기기 성능은 별도 |
| Repository policy | 7/7 통과 | commit/PR/merge 승인이 아님 |
| Grafana JSON | logs 9/10, hardware 5/6 기준 통과 | 운영 Grafana 배치 상태는 아님 |
| CSS parser guard | 통과 | 모든 시각 상태의 픽셀 검사는 아님 |
| 백업/복원 Bash 구문 | Git Bash `-n` 통과 | 실제 mysqldump·S3 upload·restore 미실행 |
| MySQL·blue/green Compose 구문 | `docker compose ... config --quiet` 통과 | 운영 볼륨/설정 적용 아님 |
| `git diff --check` | 통과 | 기존 dirty worktree의 변경 작성 주체를 뜻하지 않음 |

### 읽기 전용 운영 재확인과 남은 순서

- 운영 Loki의 `reserve` 앱 스트림은 최근 로그가 들어오고 있다. 다만 Loki 30일 CSP 0건과 서버 gzip의
  CSP 9건이 불일치하므로 원인이 사라졌다고 단정하지 않는다. 새 source category 로그를 배포한 뒤 7일 재관측한다.
- 운영 서버에는 백업/복원 실행 파일, 환경 파일, root cron, 로컬 dump, 백업 로그가 없다.
  저장소 스크립트가 존재한다는 사실은 백업 완료가 아니다.
- 운영 MySQL은 slow query가 OFF/10초/FILE이라 저장소 목표 ON/2초/파일 경로와 drift가 있다.
  첫 검증 백업 전에는 바꾸지 않는다.
- 운영 `/my-page` 응답에는 `X-Robots-Tag`가 없다. 로컬 Nginx 설정은 고쳤지만 아직 배포 전이다.
- Lightsail 자동 스냅샷은 AWS 콘솔 로그인 만료로 확인하지 못했다. 사용자가 직접 로그인한 뒤 활성 여부,
  예약 시각, 최근 생성 시각을 읽기 전용으로 확인해야 한다.

승인 뒤 운영 순서는 고정한다.

1. Lightsail 자동 스냅샷 읽기 전용 확인
2. 전용 S3의 public block/versioning/SSE-S3/lifecycle과 TLS deny 정책 생성
3. `s3:PutObject`만 가진 백업 writer IAM 생성
4. 서버에 스크립트·root 전용 환경 파일·03:10 KST cron 설치
5. 첫 수동 백업의 dump 검증·S3 object 존재 확인
6. `reserve_restore_*` 별도 DB에 복원하고 핵심 행 수 대조 후 임시 DB 정리
7. 위 단계가 모두 성공한 뒤에만 최근 26시간 성공 로그 부재 알림 추가
8. 최신 `origin/dev`에서 새 깨끗한 worktree를 만들어 전체 검증·리베이스 충돌 해결
9. 별도 승인 뒤에만 commit/PR/merge/release/deploy와 배포 후 확인 수행

현재까지 AWS·서버·DB·PortOne·Git history에는 변경을 가하지 않았다.

---

## 2026-09-07 보존 기록

검증일: **2026-09-07**. 대상: `local-preview-all-changes`의 미커밋 작업.
이전 점검의 열린 PR 9개/릴리스 `v2.5.0` 조회 기록도 아래에 보존했다. 이번 금융·캐시·검색 배치에서는 원격 상태를 다시 조회하지 않았다.
아래 로컬 변경은 아직 운영에 반영되지 않았다.

기존 Claude 변경을 보존한 상태에서 결제·목록·오류 경계·주석·CI를 중심으로 검토했다.
모든 코드와 운영 조건을 완전 감사했다는 뜻은 아니다. 우선순위 세 배치의 코드는 구현했지만,
**MySQL·실제 PG 검증과 과거 금융 데이터 복구 경계가 남아 있어 릴리스 준비 완료는 아니다.**
대화 첨부·과거 문서는 이력으로 취급하고 현재 코드, 이번 실행 결과, 과거 운영 증거를 구분한다.

## 1. 구현 범위

### 최신 배치: 광고 금융 → 계정 격리 → 검색·채팅·조회수

| 영역 | 변경 | 확인한 경계 |
|---|---|---|
| 광고 결제 | 시도 원장, 실패 확정 때만 UID 교체, 알려진 광고 웹훅 라우팅, 미결 배치 | 이전 UID의 늦은 PAID, 중복·인계 응답, PG 통신 중 DB 트랜잭션 없음 |
| 광고 환불 | 취소 의도/키 선커밋, 전액 취소 재조회, 관리자 대사·환불 요청 UI | REQUESTED/UNKNOWN/FAILED/SUCCEEDED 단일 응답은 완료 아님. 결과 미상 자동 재발신 없음 |
| 생명주기 | 미결·미이관 광고 종료 차단, 광고 보존, 가게 수정·제재 잠금 일치 | 로컬 취소 상태나 숨김으로 미결 금액을 우회하지 않음 |
| 계정 캐시 | 세대별 QueryClient/UI, 요청 시작·응답·401 refresh 세대 검증, 다른 탭 변경 감지 | 같은 SPA와 다른 탭의 A→B 전환, A의 늦은 응답/refresh가 B를 덮어쓰지 않음 |
| 로그인/프로필 | 실제 로그인과 표시 갱신 분리, 원래 보호 경로 복귀 유지 | 단순 프로필 수정은 전체 앱을 재마운트하지 않음 |
| 가게 검색 | 공개 필터·분야·지역을 DB predicate로 통일, DB 전체 정렬 후 페이지, 동점 id, LIKE 특수문자 처리 | 205건 3페이지 전체 순서·count, 숨김/정지 제외. 거리순은 좌표 bounding-box 후보를 DB 구면 거리/id 순으로 정렬 |
| 채팅 | 방 세대별 load/poll/send 가드, 전송·폴링 중복 차단 | A→B→A의 이전 응답/오류 무시; stale는 null, 현재 실패만 false로 입력 복원 |
| 홍보 조회수 | DB 원자 증가 + DynamicUpdate | 40회 동시 조회와 오래된 콘텐츠 수정이 겹쳐도 조회수 유지. 커뮤니티와 별개 도메인 |

광고 상태·수동 복구 절차는 [광고 결제 런북](ad-payments.md), 계정/채팅 계약은 [UI 구현 결정](ui-decisions.md)에 둔다.

### 직전 점검에서 이미 구현한 것 (기존 변경 보존)

| 영역 | 변경 | 확인한 경계 |
|---|---|---|
| 사업자 예약 목록 | 서버 페이지·검색·상태·가게 필터, 전체 건수, 안정적인 날짜/id 정렬, 페이지당 15건 | 101/201건의 다음 페이지와 첫 100건 밖 검색, 다른 사업자 데이터 제외, 내용·count 조건 일치 |
| 결제 결과 화면 | 본인 주문의 읽기 전용 상태 API, `no-store`, 서버 확인 뒤 완료 표시 | 조작된 `success=true`, 오래된 실패 URL, 조회 실패, 식별자 누락은 성공 근거가 아님. PG 호출·환불·재결제 없음 |
| 결제 후 이동 | 광고 내역으로 직접 이동하는 `/business?tab=ads` | 새로고침에도 광고 탭 유지. 결제 결과에서 이력 한 칸 뒤로가기 루프를 사용하지 않음 |
| 폐업·탈퇴 UI | `canClose === true` / `canWithdraw === true`일 때만 확인 허용 | 누락·문자열·숫자·조회 실패를 허용으로 해석하지 않음. 합산 수치는 설명용 |
| HTTP 오류 | 잘못된 입력 400, 잘못된 메서드 405, 미지원 본문 415 | 실제 서버 오류 500과 구분. 거부한 입력·JSON·예외 원문을 그대로 응답/로그에 복사하지 않음 |
| 페이지 입력 | 무제한이던 주요 목록에 공통 `PageRequests` 적용 | 최대 100, 음수·0 보정, JPA int offset 초과 400. 기존 더 작은 상한·내부 배치 크기는 유지 |
| 광고 입력·공개 노출 | 금액 곱셈 overflow와 콘텐츠 길이를 업로드 전에 검사, 삭제/정지 가게 노출 제외 | 가격 정책은 유지. 광고 결제 원장·환불 안정성을 완성한 변경은 아님 |
| 모바일 결제 안내 | 외부 메시지·내부 예외를 리다이렉트 URL로 전달하지 않음 | 고정 서비스 경로와 안내 문구, 요청 로그는 값 대신 존재 여부 |
| 주석 | 프론트 주석의 Java 전용 표기·HTML 제목 제거, 긴 UI 이력을 결정 문서로 분리 | 해당 주석 정리 전후 JS/JSX 실행 토큰 동일 확인. 한국어 주석 금지 규칙은 만들지 않음 |
| 재발 방지 | ESLint 주석/JSX 전역 style 규칙과 정책 테스트, PR 감사 스크립트 | 규칙을 문서뿐 아니라 실행 검사에 연결. 기존 정책과 결합 |
| CI·PR 문서 | Node 22 기준 통일, 정책 테스트 단계, 증거·위험 중심 PR 템플릿 | 현재 로컬 도구 검증. 변경된 Actions의 Linux 실행은 새 PR CI에서 확인해야 함 |

일반 규칙은 [코드 컨벤션](../rules/code-conventions.md), 디자인 계약은 [디자인 시스템](design-system.md),
공통 UI의 선택 이유는 [UI 구현 결정](ui-decisions.md)에 둔다. 같은 규칙을 여러 주석에 길게 복제하지 않는다.

## 2. 실행 증거와 한계

| 검사 | 이번 결과 | 이 결과가 증명하지 않는 것 |
|---|---|---|
| `backend`: `gradlew.bat test --no-daemon` | 62개 suite, **265개 통과**, 실패·오류·skip 0 | 운영 MySQL 잠금·DDL·실제 PG 결과 |
| `frontend`: `npm run test:run` | **29개 통과** | 모든 화면·상태 조합 |
| `frontend`: `npm run test:policy` | **7개 통과** | 열린 PR을 자동 머지해도 안전하다는 보장 |
| `frontend`: `npm run test:e2e` | **34개 통과**: Chromium PC 17 + 모바일 17 | API 응답을 대체한 브라우저 회귀다. 실결제·실제 카메라·모든 일반 모션 검증 아님 |
| `frontend`: `npm run lint` | 통과 | 서버 권한·데이터 정확성 |
| `frontend`: `npm run build` 및 번들 예산 | 통과, 초기 gzip 약 319.2 KiB, 최대 JS 약 557.3 KiB | 최적화 완료·실제 기기 성능 |
| `node scripts/validate-grafana-dashboards.mjs` | 통과: 로그 활성 쿼리 9/10, 자원 5/6 | 운영 Grafana 반영·14일 데이터 존재·실제 패널 모양 |
| `git diff --check` | 통과 | 기존 변경 모두가 이번 작업이라는 뜻 아님 |

실행하지 않은 것: 신규 PR/CI 실행, NGINX 실제 응답 헤더 재검증, 운영 DB/PG/S3 변경, 웹훅 재처리,
배포·서버 롤백 훈련. 로컬 테스트 통과를 운영 검증 체크로 옮겨 적지 않는다.

검사 중 로그인 복귀 경로와 새 광고 운영 탭의 조건 분기 회귀를 발견해 수정했다.
위 수치는 수정 후 전체 재실행 결과이며, 광고 운영 화면은 PC·모바일 캡처도 확인했다.

## 3. 구현 후에도 남은 릴리스 전 경계

### 완료한 P1 코드: 예약 환불 확정 근거

예약 환불의 웹훅과 재조회 스케줄러가 `RefundSettlementPolicy`를 함께 사용한다.
`PAID`만 보고 실패 처리하지 않으며, 누적 취소액·이번 취소 ID·개별 취소 상태/금액과
동시에 진행 중인 다른 취소를 대조한 뒤 성공·실패를 확정한다. 충돌·누락은 로컬 결제나 원장을
임의 변경하지 않고 `REFUND_STATE_UNCERTAIN` 대사 큐에 남긴다.

최초 취소 호출의 타임아웃도 `FAILED`로 닫지 않고 `REFUND_PENDING`으로 잠가 자동 재시도를 막는다.
`SUCCEEDED` 응답의 실제 취소액이 요청액과 다르면 동일하게 미결·대사 대상으로 둔다.
원장 시작 실패 시 PG 호출을 중단하고, PG 성공 원장은 로컬 결제 커밋 뒤에만 `SUCCEEDED`로 닫는다.
로컬 롤백으로 결제가 `PAID`여도 미결 원장이 남으면 새 환불 요청을 차단한다.
웹훅과 스케줄러의 결말 적용이 겹쳐도 조회 당시 기환불액과 잠금 뒤 현재 누적액이 맞는 경우만
동일 결말로 인정하며, 상태가 바뀌었으면 원장만 닫지 않고 대사 큐에 남긴다.
가게 취소·자동 취소 호출부는 미결을 완료로 오해해 예약금 플래그를 지우지 않고,
사용자 취소의 즉시 전액 환불은 바깥 트랜잭션에도 같은 플래그를 반영한다.

이 완료 표시는 **프리뷰 코드와 로컬 회귀 범위**다. 실제 TEST PG 취소·서명 웹훅,
응답 유실, 운영 MySQL에서의 동시 요청·원장 반영은 아래 운영 검증 항목으로 남아 있다.

### 광고 금융

- 새 원장은 **현재 남아 있는 UID부터** 보존한다. 과거 코드가 덮어쓴 주문번호는 PG 거래 이력과 별도 대사해야 한다.
- 환불 발신 전 커밋 뒤 프로세스가 종료되면 실제 HTTP가 전송되지 않았을 수도 있다. 키 보존 시간 이후까지 맹목 재시도하지 않고 수동 복구한다.
- 오래된 READY/NOT_FOUND·부분 취소·과거 REFUNDED 모순은 임의 종결하지 않는다. 운영자 증거와 건별 승인/정책이 필요하다.
- 자동 배치는 기본 5분 간격, 회당 현재 UID 이관 10건/미결 조회 10건이다. 실제 배포 시 저장량·PG 조회·잠금 부하는 따로 확인한다.
- H2의 실제 커밋/lease 검사와 mock HTTP 계약은 MySQL·실제 TEST PG·서명 PAID 이벤트 증거가 아니다.
- 새 상태/테이블이 쓰인 뒤 구버전 백엔드로 무조건 롤백하지 않는다. [스키마 확인](manual-ddl.md)과 [광고 복구 런북](ad-payments.md)을 먼저 따른다.
- 배너 제목·내용은 추천 문구를 시작값으로 직접 수정할 수 있다. 서버가 한쪽 누락·100/300자 초과·알 수 없는
  추천 키를 파일 업로드 전에 거부하고, 금액은 문구와 무관하게 유형·기간으로만 계산한다. React 표면은 문자열로
  렌더해 HTML을 실행하지 않는다.
- 결제된 `ACTIVE` 광고도 현재는 사업자가 문구를 수정할 수 있고 관리자가 사후 `SUSPENDED` 처리하는 정책이다.
  광고 권리 확인·선검수·자동 콘텐츠 심사는 이번 안정화 범위가 아니며 별도 제품·운영 정책 결정이 필요하다.

### 계정 격리와 검색

- 계정 전환 회귀는 로컬 모의 API로 검증했다. 실제 쿠키 만료·소셜 로그인·브라우저/기기 조합 전체 검증은 별개다.
- 취소 신호는 이미 서버에 도착한 쓰기를 되돌리지 않는다. 서버 소유권·멱등 처리는 계속 필수다.
- MySQL FULLTEXT 정렬/필터는 코드와 호출 계약을 수정했지만 실제 SQL·인덱스·EXPLAIN은 실행하지 않았다.
- 거리순은 더 이상 전체 일치 결과를 JVM 메모리에 올리지 않는다. 국내 전체를 포함하는 좌표 bounding-box 후보에 DB 구면 거리/id 정렬과 페이지 제한을 적용한다. H2는 동작 계약만 확인했으며 MySQL 인덱스·EXPLAIN은 별도 관문이다.
- NGINX는 원래 요청 경로를 쓰는 변경이 이미 있다. 과거 `$uri` 문제를 그대로 미수정 목록에 재등록하지 않는다.

## 4. 다음 코드·검증 배치

| 순서 | 남은 작업 | 완료 기준 |
|---|---|---|
| 1 | 별도 검증 MySQL의 금융 잠금·FULLTEXT 통합 검사 | 실제 DB 엔진에서 lease 인계/폐업·제재 경합, 커밋된 201건 이상 검색·count·특수문자·쿼리 계획 확인 |
| 2 | 승인된 TEST PG 시나리오와 누락 주문 대사 | 서명 PAID/취소 이벤트, 응답 유실, PG 성공 뒤 DB 반영 실패, 과거 UID 목록과 원장 대조 |
| 3 | 남은 빈 catch·사업자 가게 필터 오류 | 통신 실패와 목록 없음 구분, 재시도 제공. 조용한 폴링 일시 실패와 구분 |
| 4 | 이미지 최초 열기·닫기·뒤로가기 일반 모션 | PC/390px 실제 DOM·프레임 검사. reduced-motion smoke로 대체하지 않음 |
| 5 | 큰 JS 청크와 거리 검색 비용 | import graph·실기 성능·쿼리 계획을 측정하고 변경 |

위 1/2는 운영 데이터를 수정하라는 지시가 아니다. 환경과 TEST 주문·쓰기 범위를 확인하고 필요한 승인을 먼저 받는다.

## 5. 장기 공개 사이트·앱 분리 제안 (미구현)

방향은 `reserve.it.kr`을 공개 설명·검색 유입·서비스 탐색에, `app.reserve.it.kr`을
로그인·예약·결제·사업자·관리자 작업에 쓰는 편이 확장에 유리하다. 다만 호스트만 먼저 나누지 않는다.
현재 OAuth 콜백, CORS, canonical/OG/sitemap, NGINX 인증서·리다이렉트, CSP와 배포 URL이
`reserve.it.kr`에 연결돼 있으므로 URL 소유권 표와 전환·롤백 계획을 먼저 확정한다.

권장 순서는 다음과 같다.

1. 현재 호스트에서 검색창 → 운영 배너/공지 → 서비스 도메인 → 추천 가게 구조의 앱형 탐색 화면을 먼저 검증한다.
2. 자유 문자열인 가게 `category`와 별도로 정규화된 서비스 도메인을 둔다. `FOOD`, `BEAUTY_CLINIC`,
   `SPORTS`, `PERFORMANCE`, `POPUP` 같은 **탐색 분류**와 기존 `SLOT`/`SESSION`/`DAY` **예약 방식**을 섞지 않는다.
3. 오프라인 대기는 시간 예약의 새 상태 하나가 아니라 번호표·호출·만료·재입장 규칙이 필요한 별도 기능 경계로 설계한다.
4. 현재 StoreList의 플로팅 `BANNER`를 홈 상단 상품으로 바로 재사용하지 않는다. 노출 위치, 비율,
   일정·우선순위, 공지/유료 광고 구분, 접근성 대체텍스트와 노출 집계를 먼저 모델링한다.
5. 공개 가게/콘텐츠의 canonical은 한 호스트에만 둔다. 권장안은 검색 가능한 공개 탐색은 루트 도메인,
   예약 행동과 개인 화면은 앱 서브도메인이다. 중복 색인은 redirect/canonical로 막는다.
6. 마지막에 DNS·TLS·NGINX·OAuth 제공자 콜백·쿠키/CORS·CSP·모니터링·배포 파이프라인을 함께 전환한다.

캐치테이블의 정보 구조는 참고하되 시각 스타일을 복제하지 않는다. RESERVE의 토큰·공통 컴포넌트·포커스·모션 규칙을
그대로 사용하고, 모바일 우선 화면을 PC에서 과도하게 좁은 고정 폭으로 강제하지 않는다.

## 6. 열린 PR 9개: 조회 당시 상태

이번 금융 배치에서는 아래 원격 상태를 재조회하지 않았다. 이전 점검의 조회 당시 기록이다.
아래 통과는 **그 PR head에서 보고된 검사 결과**다. 지금의 프리뷰 내용이나 최신 dev와의 통합 통과가 아니다.

| PR | 상태/근거 | 처리 제안 |
|---|---|---|
| [#177](https://github.com/hanjeun/reserve/pull/177) frontend minor 묶음 | `build-frontend` 실패. run `33958045491`의 npm ci에서 rc-tabs patch 적용 실패 | AntD/rc-tabs 변경 후 모바일 탭 패치를 실제 DOM 기준으로 재생성·검증. `--ignore-scripts`로 우회하지 않음 |
| [#162](https://github.com/hanjeun/reserve/pull/162) ESLint 10 | `build-frontend` 실패. run `33956906250`에서 react-hooks 플러그인 peer 충돌 | `@eslint/js`·플러그인 지원 조합을 함께 맞춤. `--force`/`--legacy-peer-deps`로 통과시키지 않음 |
| [#110](https://github.com/hanjeun/reserve/pull/110) `@eslint/js` 10 | CodeQL/Sonar는 있으나 필수 build-backend/build-frontend 결과 없음 | 성공 PR로 분류하지 않음. ESLint 본체와 맞춘 뒤 필수 CI 실행 |
| [#170](https://github.com/hanjeun/reserve/pull/170) humanfs 패치 | 필수 검사 통과 | 겹치는 lockfile 변경 확인 후 최신 dev에서 재검증 |
| [#168](https://github.com/hanjeun/reserve/pull/168) Actions 묶음 | 필수 검사 통과. setup-java major 변경 포함 | 러너·Java 설정·배포 영향 별도 확인 |
| [#165](https://github.com/hanjeun/reserve/pull/165) backend minor 묶음 | 필수 검사 통과. Boot/AWS/Sentry/Gradle 변경 포함 | 금융 회귀와 래퍼 호환성 재확인, 필요시 범위 분리 |
| [#164](https://github.com/hanjeun/reserve/pull/164) framer-motion 13 | 필수 검사 통과 | 일반 모션 수동 회귀 후 판단. 현재 모션 문제와 섞어 자동 머지하지 않음 |
| [#157](https://github.com/hanjeun/reserve/pull/157) CodeQL init SHA | 필수 검사 통과 | analyze 변경과 버전을 함께 정렬 |
| [#153](https://github.com/hanjeun/reserve/pull/153) CodeQL analyze SHA | 필수 검사 통과 | init 변경과 함께 정렬 |

재조회 도구 (원격 변경 없음):

```bash
node scripts/pr-review-audit.mjs
node scripts/pr-review-audit.mjs --json
```

필수 검사가 없거나 skip/neutral이면 준비 완료로 보지 않는다. 이 도구는 상태를 보고할 뿐 머지·재실행·라벨 수정을 하지 않는다.
Node 20의 jest-dom 7 engine 경고도 있었지만 #177의 직접 실패 원인은 탭 패치다. 이번 로컬 CI 기준을 Node 22로 맞춘 것이 그 패치를 고친 것은 아니다.

### GitHub 설정 제안 — 아직 적용하지 않음

- 조회 당시 9개 PR의 라벨이 모두 비어 있고, Dependabot에 지정한 `chore`/`dependencies` 라벨이 저장소에 없다. 기존 라벨 정책을 확정한 뒤 생성/설정 정합성을 맞춘다.
- dev/main 모두 필수 검사는 설정돼 있으나 strict는 false다. 이전 head의 초록색만으로 최신 통합 안전성을 단정하지 않는다.
- dev의 관리자 보호는 켜져 있고 main의 관리자 예외는 허용 상태다. main 우회 제한 강화는 저장소 설정 변경 승인 후 적용한다.
- 이번에는 커밋·브랜치 생성·stage·push·PR·merge·태그·배포·설정 변경을 하지 않았다.

머지 방식과 릴리스 ancestry 처리는 [Git 워크플로우](../rules/git-workflow.md)를 따른다.
새 릴리스 버전은 실제로 합칠 범위를 확정한 뒤 정하며, 이 문서 작성만으로 `v2.5.1`을 만들지 않는다.

## 7. 과거 운영 기록과 앞으로의 승인 경계

[결제 문서](payments.md)의 2026-09-06 기록에는 오래된 READY 2건을 개별 대사해 0건으로 정리했고,
PortOne TEST 콘솔 발신 호출 테스트의 수신·서명 검증을 확인했다고 되어 있다.
**이번에는 운영 원장을 다시 조회하지 않았다.** 9월 5일 메모리의 “READY 2건 미해결”을 현재 상태로 반복하지 않는다.
호출 테스트와 실제 PAID 결제 이벤트·중복 환불 E2E는 다른 증거다.

순서:

1. 이번 로컬 금융·캐시·검색 회귀 결과를 확인하고 위 MySQL/TEST PG 증거와 수동 복구 정책을 보완한다.
2. 현재 변경을 승인된 범위로 분리하고, 별도 승인 후에만 커밋/PR/CI/머지/릴리스한다. 기존 Claude 변경의 작성 주체와 의도도 보존한다.
3. 새 코드가 포함된 PR의 Linux CI에서 전체 검사와 원자적 배포 테스트를 확인한다.
4. 배포 승인 후 현재 스키마·웹훅 inbox·삭제 outbox·미결 건을 읽기 전용으로 재확인한다. PG/DB 상태를 바꾸는 재처리와 금전 이동은 개별 승인 대상이다.
5. Grafana 실제 반영/화면, 실제 배포일부터 CSP Report-Only 최소 7일 관측, 운영 프론트 교체·롤백 훈련을 별도 증거로 남긴다.

Lightsail 스냅샷, 백업 S3, IAM 분리, 운영 복원 훈련은 요청대로 보류한다.
이번 로컬 코드 점검으로 서버 설정·자원·유료 상품을 변경하지 않았다.
