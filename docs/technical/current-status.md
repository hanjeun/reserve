# RESERVE 현재 상태

채팅 입력·색 설정·무기한 전송 취소의 최신 구현/검증과 운영 미완료 관문은 [채팅 계약](chat-controls.md)을 따른다.

## 2026-09-28 입력·설정·검증 갱신

- 단순 선택용 `FormSelect`·`FilterSelect`는 읽기 전용 input에 `inputMode="none"`을 적용한다.
  실제 검색·tags·편집 가능한 multiple은 입력을 유지한다. 키보드 포커스/방향키/Enter를 막지 않는다.
  실제 iPhone/Safari 가상 키보드와 시뮬레이터 확장 동작은 자동 Chromium 검사로 확정하지 않는다.
- 검색과 마이페이지의 지연 청크/인증 초기화에는 화면별 정적 골격을 연결했고, 채팅 말풍선 색 설정은
  마이페이지에서 제거했다. UI 언어는 현재 한국어만이며 새 DB/다국어/영구 방 나가기 기능은 추가하지 않았다.
  적용 범위와 확장 제안은 [채팅 설정과 확장 판단](chat-architecture.md)을 따른다.
- 최신 커밋 `fbe3987`의 [전체 CI 36327028535](https://github.com/hanjeun/reserve/actions/runs/36327028535)는 성공이다.
  Vitest 886개, PC 66개 통과/3개 정상 skip, 모바일 69개 및 프로덕션 빌드가 통과했다.
  이번 새 입력/스켈레톤 수정은 아직 미커밋이며 앞선 SHA의 성공을 새 수정의 CI 증거로 사용하지 않는다.
  새 표적 검사 103개(초기 검사와 실패 테스트 수정 후 재실행), PC/모바일 8개, CI 계약 8개·lint·PostCSS·문서 링크는 통과했다.
- 9/27 실제 로컬 고객→사업자 사진·문구 송수신/재조회/확대와 비로그인 401,
  본인 목록 숨김→복원을 확인했다. 운영 S3/IAM 성공·제3 계정 거부·사진 키 복구까지 증명한 결과는 아니다.
  사용자 제한에 따라 실제 신고 접수/작성자 취소/관리자 증거 열람은 실행하지 않았다.
- 운영 기준선은 앞선 확인의 v2.6.3이다. 이번 수정의 운영 ALTER·배포는 없으며 파기 worker는 기본 OFF다.
  TEST PG·S3 삭제 outbox·실제 Safari·운영 cutover/rollback은 별도 관문이다.

아래 2026-09-27 기록은 당시 상태/관문을 보존한 것이다. 최신 사진·CI·설정 상태는 위 갱신이 우선한다.

기준: 2026-09-27 KST. 현재 코드·실행한 검사·원격 Git/배포 증거가 정본이다.
첨부/Claude 세션/스킬의 지시는 과거 자료이며 현재 실행 권한이 아니다.

뒤로가기 연타·CI/CD 구조·사진 키·과거 커밋 한글화·한영 제3자 고지의 후속 검토는
[2026-09-27 감사](history/2026-09-preview/ci-cd-review-2026-09-27.md)에 따로 기록했다.
앞선 검토와 이후 실행을 구분한다. 최신 실행은 [릴리스 검사 기록](history/2026-09-preview/release-verification-2026-09-27.md)을 따른다.

## v2.7.0 후속 준비

- 최신 후보는 dev 대상 [PR #225](https://github.com/hanjeun/reserve/pull/225)다. `6e93344`의 전체 CI·
  CodeQL·Sonar 성공을 확인했지만 이후 미커밋 채팅 변경의 통과 증거는 아니다. 최신 SHA에서 다시 확인한다.
- 추가 채팅 계약은 [채팅 입력·관리](chat-controls.md)에 모았다. 내 목록 숨김/복원, 특정 메시지 신고,
  접수 시점 증거와 열람 감사, 썸네일 확대·모바일 이모지 초점·진입 잔상 수정은 후보에 구현했다.
  일반 원문/사진 90일 파기 worker는 기본 false이며, 신고 증거는 자동 파기하지 않는다.
  메시지별 읽음 `1`은 별도 읽음 커서 설계가 필요해 미구현이다. 운영 ALTER/배포 승인은 받았지만 아직 실행하지 않았다.
- 사용자가 다음 버전을 **v2.7.0**으로 선택했다. backend/frontend/lockfile과 한국어 후보 릴리스 노트를
  맞춘다. 운영 기준선은 여전히 v2.6.3이며 새 버전 표시가 배포 성공을 뜻하지 않는다.
- 커밋·PR 제목 영어, PR 본문·릴리스 노트·사용자 설명 한국어를 유지한다. 과거 이력은 재작성하지 않는다.
- CI의 필수 job ID는 유지하고 백엔드 단위·Spring/H2 검사 → bootJar, Vitest, PC·모바일 Chromium을
  명시적 단계로 나눈다. PC 실패 뒤 모바일 검사와 실패 trace/스크린샷 보존도 포함한다.
  로컬 후보 수정이며 GitHub에 반영된 workflow 실행 증거와 구분한다.
- 홈에는 운영 안내와 맛집·카페/공연·클래스/팝업·대관 배너 4장, 서비스 분야 바로가기 6개가 있다.
  각 분야 목록에 독립적인 상단 메인 배너가 있는 것은 아니다. 새 UI/이미지를 추가하지 않고 기존 연결을 검증한다.
- 사용자가 사진 키의 GitHub·IntelliJ 등록과 복구본 보관을 완료했다고 확인했다.
  GitHub repository Secret 이름 존재도 확인했다(원문 미조회). 실제 설정 유효성·재시작·S3 왕복은 별도 검증이다.
  [직접 생성·등록·복구 절차](chat-images.md)를 따른다.

## 기준선과 보존

- production 기준(앞선 읽기 전용 증거): **v2.6.3**, main `b478ae8d732afa1e35642d790bfc39972556f885`.
  배포 CI `36238175151`, Deployment `6678168550` 성공을 확인했다.
  이번 서버 읽기 전용 확인에서도 blue upstream·같은 SHA·CI의 ECDSA pin 일치를 확인했다.
- 원격 dev: `eb31d61eddb3a0fbd46a20ca31aad5cc4bdec281`. main/dev의 큰 커밋 수 차이를 기능 차이로 계산하지 않는다.
- 원본: `local-preview-all-changes`, HEAD `c1faea2f480c41d55c3e2bad1abaf13cf9242bea`,
  ahead 1 / behind 73, staged 0. 혼합 워크트리는 릴리스 후보가 아니다.
- 외부 manifest: `C:/Users/USER/Projects/RESERVE-release-manifests/2026-09-27-preview-before.json`.
  경로·상태·SHA-256·기능 묶음·dev blob을 고정했다. `scripts/audit-preview-release.mjs`는 읽기 전용이다.
  같은 폴더의 `2026-09-27-preview-after.json`과 `2026-09-27-changes.md`에 종료 상태와 이번 변경 경로를 기록한다.
- 초기 검사 당시 `index.lock`은 없어 제거하지 않았다. 이후 별도 승인을 받아 최신 dev 기반
  `C:/Users/USER/.codex/worktrees/reserve-integration/RESERVE`에 `feature/v2.6-integration`을 생성했다.
  시작은 위 dev와 같은 clean SHA였고, 기능별 이식과 충돌 해결 직후에는 **unstaged 통합 후보**였다.
  이번 대화에서 전체 CI·commit·PR·배포 승인을 받았다. 원본에서 staging/commit하지 않으며 운영 DDL은 별도 승인한다.
  외부 `2026-09-27-integration-plan.json`과 `2026-09-27-integration-after.json`에 입력/결과와 기능 묶음을 기록한다.
  Claude outputs는 원본에 보존하고, 참조되는 이미지·불변 snapshot·design-previews는 바이트 그대로 이식했다.
  대체된 `ChatLauncher`와 빈 아이콘 README만 통합 후보에서 삭제했다. 원본/Git 이력에서 복구 가능하다.
  설치된 스킬·메모리는 변경하지 않았다.
- 원본의 이전 로컬 버전 2.5.0과 과거 “다음 2.6.0”은 운영 기준선이 아니다.
  사용자가 선택한 v2.7.0 후보 표시로 backend/frontend/lockfile을 맞췄으며 운영은 v2.6.3을 유지한다.

## 다섯 상태를 분리한다

“부분”은 표적 범위만, “미확인”은 새 증거 없음이다. 로컬 통과는 운영 통과가 아니다.

| 기능 | 코드 존재 | 로컬 검증 | dev 병합 | production 배포 | 외부 실증 |
|---|---|---|---|---|---|
| v2.6.3 인증 rotation·sliding·재사용 탐지·쿠키 | 운영 코드를 프리뷰에 복구 | 단위/MVC/H2 persistence 표적 통과 | 예 | 예 | 배포 증거; 실제 계정 회귀는 후보에서 재확인 |
| 기존 이미지/JS 캐시·gzip | 운영 코드 존재 | 배포 응답 확인 | 예 | 예 | 운영 헤더 확인 |
| 직접 환불 제한·광고 전환 귀속·문의 HTML/이메일 안전성 | 통합 후보 존재 | 환불/전환 재검사; 문의는 앞선 검사 증거 | 아니요 | 아니요 | 새 변경의 MySQL/TEST PG 미확인 |
| 광고 작성 미리보기·노출형 명칭·직접 제목/내용·탭 URL 정리 | 통합 후보 존재 | PC/모바일 광고 흐름·탭 URL 검사 통과 | 아니요 | 아니요 | mock API이며 실제 PG 결제 아님 |
| 통합 메시지·가게 문의·차단·신고 | 통합 후보 존재 | 서비스/프론트 표적 재검사 통과 | 아니요 | 아니요 | 두 실제 계정 미확인 |
| 대화 사진 첨부 | 통합 후보, 키 없으면 비활성 | 서버 권한/암호화·PC/모바일 mock 업로드/Blob/확대 통과 | 아니요 | 아니요 | Secret 이름 확인·사용자 복구본 보관 확인; 실제 S3·복구·계정 시나리오 미확인 |
| 목록 숨김·메시지 신고·90일 파기·증거 감사 | 통합 후보, 파기 기본 OFF | 서비스/JPA·PC/모바일·격리 MySQL 33테이블 SQL 검증 | 아니요 | 아니요 | 실제 계정/S3·정책 고지·운영 파기 미확인 |
| 고객지원 사진 경로 | `system/chat/support`로 수정 | 저장·삭제 경계 표적 통과 | 아니요 | 아니요 | 실제 S3 업로드 미확인 |
| 목록 스켈레톤·저장된 카드/리스트 보기 | 공통 정적 표면 연결 | route·view mode·개인 목록 검사 통과 | 아니요 | 아니요 | 실제 Safari 미확인 |
| 새 채팅/공지/게시글 GET 쓰기 분리 | GET 순수조회, open/read/view POST | 표적 서비스/보안/transport 검사 | 아니요 | 아니요 | 기존 `/api/chat/my*` 호환 GET은 유지 |
| 검색/관광 프록시/공개 소식/독립 검색 | 통합 후보 존재 | 검색 정렬·HTTPS bounded 프록시 표적 재검사 | 아니요 | 아니요 | MySQL FULLTEXT는 별도 관문, flag off |
| 운영 안내·콘텐츠 출처 | 프리뷰 라우트·sitemap 존재 | 과거 로컬 증거 | 아니요 | 아니요 | 운영 200은 SPA fallback, 배포 증거 아님 |
| 기존 MySQL 백업·S3/IAM·cron·복원 | 운영 설치 증거 | 새 export 누락 복구·구문 확인 | 기존 구성은 예 | 기존 구성은 예 | 9/25 26/26 복원·행 수 일치, 9/26 28테이블 백업 업로드 |
| 동시 FE/BE cutover·rollback·옛 해시 자산 보존 | 통합 후보 존재 | 구문·Linux 전환/ERR rollback·자산 보존/충돌/경로 거부 drill 통과 | 아니요 | 아니요 | 서버 임시 fixture 검증이며 실제 nginx 전환/외부 smoke 아님 |
| CPU 실행/I/O 대기/steal 분리·새 캐시 | 로컬 후보 존재 | Grafana/CSS/정적 검사 | 아니요 | 아니요 | collector/nginx/CDN 운영 적용 미확인 |
| Grafana 알림·CSP | 런북·Report-Only 존재 | 쿼리/현재 로그 문구 대조 | 일부 기반 | 일부 기반 | 백업 Loki 로그 증거 있음; 알림 실제 수신·CSP 7일은 미완료 |

백업을 “미구성”으로 판단했던 9/23 문서는 [과거 상태](history/2026-09-preview/current-status-2026-09-23.md)에 보존했다.
자동 Lightsail 스냅샷은 사용자의 비용 결정대로 끈 상태를 유지하고 새 AWS 자원을 만들지 않는다.

9/27 현재 서버에도 `/etc/reserve-backup.env`가 600/root이고 root cron(18:10 UTC)이 존재한다.
최신 로컬 덤프는 9/26 18:10 UTC의 10,599바이트 파일이며 이번 gzip 무결성 검사도 통과했다.
최신 S3 객체를 이번에 읽은 증거는 아니다.
운영 MySQL 8.0.45·28테이블에서 기존 광고 원장/refresh 구조가 이미 있는 반면 신규 안내/신고 테이블,
사진/clientMessageId/ownerUnread 컬럼·새 index는 없음을 구분했다. 특히 sender_role ENUM에는 OWNER가 없다.
필요한 수동 DDL 제안과 현재 상태는 [수동 DDL](manual-ddl.md)의 9/27 대조 표에 기록했다. 운영 DDL은 실행하지 않았다.

## 이전 표적 검사 범위

- 아래는 **격리 통합 후보에서 실행한 결과**다. 원본 프리뷰의 앞선 결과와 합산하지 않는다.
- 백엔드 main/test 컴파일 및 표적 29 suite·175개 통과: 인증 회전/보안 MVC, 직접 환불,
  광고 지표/전환/목록, 채팅/사진/저장/신고, 검색 정렬, QR, 관광 프록시.
- 프론트 lint:ci 통과. 표적 Vitest 22파일·262개와 분리한 관리자/라우트 skeleton 2파일·37개 통과.
  정책 검사 7개, PostCSS 12파일·잘못된 산문 선택자 0건, Grafana validator 통과.
- 전용 포트 4273의 PC/모바일 Playwright **20/20** 통과: 광고 작성/미리보기,
  101/201행 페이지네이션·오류, 사진 전송/확대, 계정/다른 탭/로그아웃, 뒤로가기/지연 라우트.
  mock API와 합성 사진을 사용한 결과로, 운영 업로드/결제 증거가 아니다. 두 사진 캡처도 시각 확인했다.
- 초기 번들 예산 초과를 고쳤다. `react-dom/client` 청크 경계와 관리자 Pagination 의존성만 분리해
  화면/디자인은 유지한다. 수정 후 Vite 프로덕션 산출물·번들 예산: 초기 gzip 326.8KiB,
  최대 청크 544.3KiB(기존 제한 350/600KiB 유지). 수정 후 `npm run build -- --logLevel error`의
  sitemap 생성 → Vite build → bundle 예산 전체 수명주기도 통과했다.
- 최종 문서 링크 345개·누락 0건, snapshot 108/108·ZIP 117 entry/해시 일치,
  YAML·24 shell block·7 shell script 구문, 옛 해시 자산 보존/충돌/경로 거부 검사와 diff check 통과.
  후보 sender_role 스키마 관문도 기존 ENUM/OWNER ENUM/VARCHAR 길이/오류 타입 5개 표적 검사를 통과했다.
  상세 명령/한계는 [릴리스 후보 체크리스트](release-candidate-2026-09-27.md)에 기록한다.
- 전체 backend/Vitest/Playwright suite·전체 viewport·Safari·라이선스 감사·실제 외부 통합은 실행하지 않았다.
  버전/키/외부 관문을 확정한 뒤 최종 커밋 후보에서 전체 CI를 한 번 실행한다.
- Windows Git Bash는 symlink 대신 복사본을 만들어 rollback drill이 중단됐다.
  Docker Linux 엔진도 사용 불가였다. 이는 성공 증거가 아니며 테스트를 완화하지 않는다.

## 현재 계약·안전 경계

- 광고 BADGE는 API/DB 호환 값을 유지하고 사용자 화면에서는 **노출형**이다. 카드/리스트 우선 노출과 작은 광고 표기,
  가게 목록 플로팅 BANNER를 구분한다. 지표는 참고용이며 과금 증거가 아니다.
- QR 체크인은 승인된 본인 예약의 출석 시각 기록이지 자동 승인이 아니다. 가게 미결 의무는 409 삭제 차단이다.
- refresh는 JSON token 없이 access/refresh HttpOnly cookies 두 개를 설정하고 운영 rotation 의미를 유지한다.
- 사진은 JPG/PNG/WEBP/GIF 한 장·8MiB, 캡션 선택, 기존 2000자·clientMessageId 재시도 계약을 사용한다.
  실제 바이트 검사·참여자/가게 상태/차단 확인을 거쳐 AES-GCM 암호문만 기존 S3에 저장한다.
  공개 CDN 이미지 URL은 반환하지 않고 인증 Blob으로 표시한다. 관리자 가게 사진은 신고 문맥 범위만 허용한다.
- `CHAT_IMAGE_ENCRYPTION_KEY`가 비어 있으면 텍스트 채팅은 유지하며 사진만 비활성이다. 잘못된 키는 기동 실패다.
  키 유실/무계획 교체는 기존 사진을 복구 불가로 만든다. 별도 보호된 보관·회전 계획이 활성화 관문이다.
  9/27 키 등록 전 실제 로컬 브라우저에서 config의 `enabled: false`를 확인했다. 당시 사진 버튼은 이 값 때문에 숨겨졌다.
  키 설정/서버 재시작은 하지 않았다. S3 코드 경로 확인과 실제 버킷/업로드 검증을 혼동하지 않는다.
  사용자는 복구본을 **암호관리자에 보관하고 GitHub Secret으로 전달**하는 방식을 선택했다.
  보관 방식 선택과 실제 키 생성/등록/복구 검증은 다른 상태다. 이번에는 키를 생성/출력/등록하지 않았다.
  앞선 조회에는 키 이름이 없었으나, 사용자 등록 후 재조회에서 repository Secret 이름 존재를 확인했다.
  production environment에는 같은 이름이 없으며 중복 등록은 필요 없다. 값은 조회하지 않았다.
  관광 API Secret 이름은 repository에 존재한다. 이름의 존재는 값의 유효성/외부 연동 성공을 증명하지 않는다.
- CDN 삭제 후 잔존은 S3 삭제와 다르다. Cache-Control은 즉시 전 세계 제거를 증명하지 않는다.
  새 invalidation IAM·CDN 정책 변경은 이번에 하지 않았으며 별도 승인이 필요하다.
- 프로세스 인자로 노출된 Figma 자격증명은 이 저장소 기능 오류와 별개의 로컬 보안 문제다.
  키를 재출력하지 않으며 회전/CLI 인자 중단의 완료 증거는 없다.

## 남은 순서

1. 최신 dev 격리 브랜치·기능별 이식·78개 충돌 파일 해결·운영 인증/캐시 대조와 로컬 표적 검사는 완료했다.
   stage/commit/PR은 별도 승인을 받는다. 대형 snapshot/cherry-pick/add-A는 사용하지 않는다.
2. 새 버전과 키 복구본/Secret 등록을 확정하고 새 MySQL 구조·잠금/조회, TEST PG,
   실제 S3/두 계정과 Linux cutover/rollback·fingerprint를 검증한다. 기존 백업은 재구성하지 않는다.
3. 최종 커밋 후보에서 전체 CI·Safari/실계정 관문을 한 번 확인한다. 이미 한 로컬 검사를 매번 반복하지 않는다.
4. 승인 후 PR·merge·릴리스·배포, 고유 라우트/sitemap/사진/로그아웃/결제 복구 smoke를 확인한다.
5. 승인 후 기존 Grafana 알림 발화·수신, 새 CPU collector/dashboard 적용, CSP 7일 관측을 완료한다.
   v2.4.0·v2.4.1 Release 보완과 의존성 PR은 별도로 진행한다.

## 전체 남은 작업 — 9/27 후속 정리

기존 구현을 다시 만드는 목록이 아니라 통합·활성화·외부 검증·승인을 구분한 목록이다.

| 우선순위 | 할 일 | 현재 경계/완료 기준 |
|---|---|---|
| 완료(로컬) | 최신 dev와 기능별 manifest 대조·명시 파일 이식 | 864개 입력 고정·78개 충돌 해결, 컴파일/표적/브라우저/번들 통과. 아직 dev 병합/배포 아님 |
| P0 | 사진 키 보관·복구/보존·삭제 정책과 활성화 | 사용자 등록/보관 완료 확인, repository Secret 이름 존재. 재시작/사진 왕복·복구 실증은 미실행; 임시 운영 키 금지 |
| P0 | 새 API·스키마·환경 변수 배포 목록 확정 | 운영 MySQL 읽기 전용 대조 완료. 새 컬럼/안내·신고와 OWNER ENUM 차이 확정; 격리 MySQL 검증/승인된 DDL만 남음 |
| P0 | 기존 복구 수단의 현재 가용성·실패 통지 확인 | 백업/IAM/cron 재생성 아님. 최신 객체/복원 가능성과 새 스크립트 운영 설치본 차이 확인; 런북의 DDL 관문 준수 |
| P0 | 금융·계정·S3 외부 실증 | TEST PG PAID 복구/웹훅/동시 환불 단일 호출, MySQL 잠금·pagination·거리, S3 사진 권한/삭제 outbox; LIVE PG 승인 없음 |
| P0 | 실제 동시 cutover/rollback 확인 | Linux fixture 전환/ERR rollback·자산 보존 drill 통과. 실제 nginx 전환·옛 lazy 요청·실제 smoke는 배포 관문 |
| P1 | 확정 후보에서 최종 검사 한 번 | 전체 CI/build/sitemap/bundle, 핵심 PC/모바일/Safari·두 계정/다른 탭, 문서 링크·불변 snapshot. 반복 구현 중에는 표적 검사만 |
| P1 | 광고·공개 라우트·메신저 최종 제품 확인 | 노출형 카드/리스트·작은 광고 표기·직접 문구·배너 효과/미리보기·탭 URL, 사진/신고/차단, 고유 공개 본문 확인 |
| P1 | 릴리스 정본·버전·문서/자산 정리 | 사용자가 v2.7.0 선택; backend/package/lockfile/한국어 후보 노트 동기화. 운영 v2.6.3과 구분, 배포일·사진 활성화는 미확정; 증거 원본 일괄 삭제 금지 |
| 승인 | stage/commit/PR/merge/tag/deploy | 별도 승인. 공동 저자는 실제 기여별 기록, squash trailer와 main/dev 계보 유지 |
| P2 | 관측 마무리 | Grafana 알림 실제 수신·백업 부재/OAuth/S3 실패 문구, CPU collector→dashboard, 앱 로그 수집 확인→CSP 7일. 아직 강제 CSP 전환 아님 |
| 별도 | 캐시·CDN 삭제 정책, 과거 Release·의존성 | 새 캐시 후보 검증, CDN 잔존/즉시 삭제 정책, v2.4.0/2.4.1 보완. #110/#162 재개하지 않음 |
| 보안 후속 | Figma 키 노출 대응 완료 증거 | 키 재출력 금지. 사용자가 회전/CLI 인자 중단을 완료했는지 확인; 프로젝트 배포 완료로 대신 표시하지 않음 |
| 별도 제품 | API v1·AI 자동답변·유료 혜택·MFA·reset-code 해시화·광고 권리/선검수 | 이번 릴리스 통합과 분리한 후속 범위. 이번에 구현 또는 완료 주장하지 않음 |
| 결정/별도 | 영어 commit 유지·공동 저자 배지 | 영어 commit/PR 제목, 한국어 PR 본문·릴리스 노트 유지로 결정. 이력 재작성 없음; 배지 내부 counter 미공개 |

FULLTEXT는 별도 MySQL DDL·EXPLAIN·LIKE 결과 동등성 전까지 off로 유지한다.
사진 암호화 키는 DB/S3 백업만으로 복구되지 않는다. 키 보관을 기존 백업 완료와 별도로 판단한다.
설치된 스킬·메모리와 Claude outputs/디자인 snapshot/날짜별 증거는 수정·삭제하지 않았다.
후속 배지 증거는 [공동 저자 조사](history/2026-09-preview/github-coauthor-audit-2026-09-27.md)의 Quickdraw·AI 항목에 기록했다.
