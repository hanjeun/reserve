# v2.7.0 통합 후보 체크리스트 — 2026-09-27

사용자가 선택한 다음 릴리스는 **v2.7.0**이다. backend/frontend/lockfile과 한국어 CHANGELOG 초안을
맞췄으며 운영은 아직 v2.6.3이다. 커밋·PR 제목 영어, PR 본문·릴리스 노트 한국어를 유지한다.
사용자가 사진 키 등록·복구본 보관 완료를 확인했고 repository Secret 이름도 확인했다(원문 미조회).
[준비 절차](chat-images.md)와 [최신 실행 기록](history/2026-09-preview/release-verification-2026-09-27.md)을 따른다.
이 문서 자체는 실행 승인이 아니다. 이번 대화의 CI·commit·PR·배포 승인과 별개로 운영 DDL은 별도 승인한다.

현재 혼합 프리뷰는 배포 후보가 아니다. 최신 dev의 별도 작업공간으로 기능별 이식과 코드 커밋을 마쳤다.
dev 병합·외부 관문·배포는 완료되지 않았다. [현재 상태](current-status.md)의 다섯 상태를 기준으로 판단한다.
배포 체크리스트 스킬에 따라 코드/검사/승인/운영 증거를 분리했다. 이 문서의 명령은 실행 승인이 아니다.

## 이미 된 일과 새 일을 구분

- 운영 v2.6.3, dev `eb31d61e…`: 배포된 인증 rotation·쿠키·캐시 수정은 유지한다.
  프리뷰에서 빠진 refresh rotation 5개 원본 파일과 예외/테스트를 원격 코드로 복구했다.
- 백업: 9/25 cron·분리 S3/IAM·26/26 격리 복원·행 수 일치, 9/26 28테이블 백업 업로드 증거가 있다.
  기존 자원을 다시 만들지 않으며 자동 Lightsail 스냅샷은 끈 채 유지한다.
- 로컬 backup/restore 스크립트는 운영 설치본이 아니다. Docker AWS 폴백의 export 누락을 복구했고,
  기존 로컬 검증·부분 파일/검증 덤프 보존·복원 대상 제한은 유지했다. 설치/실행은 하지 않았다.
- 직접 환불 제한·광고 전환 귀속·문의 안전성은 이미 프리뷰에 구현돼 있다. 표적 검사를 통과했지만
  아직 dev 통합·새 변경의 MySQL/TEST PG 실증 완료가 아니다.

## 이번에 바꾼 파일과 이유

| 묶음 | 파일 | 이유 |
|---|---|---|
| 계정 회귀 | `RefreshToken.java`, `RefreshTokenRepository.java`, `TokenProvider.java`, `TokenService.java`, `AuthApiController.java`, `RefreshRejectedException.java` 및 해당 테스트 | 운영 rotation/sliding/이전 해시·행 잠금·유예 후 재사용 폐기·두 cookie 계약 복원 |
| 고객지원 사진 | `FileStoragePaths.java`, `ChatIntroService.java` 및 경계 테스트 | 삭제 관문이 인정하지 않던 `support/chat`를 `system/chat/support`로 통일 |
| 대화 사진 서버 | `ChatImageCipher/Service/Controller`, 사진 DTO, `ChatMessage/Response`, `ChatService`, `FileStorageService`, `AdminChatController` 및 표적 테스트 | 실제 이미지 검증·암호화·소유권·차단·재시도·S3 bounded read/abort·신고 범위 접근 |
| 대화 사진 UI | `ChatImage/Picker`, `ChatBubbleList`, `MessengerContent/Shell`, `ChatTab`, `ChatReportsPanel`, `useChatThread`, `useChatImageDraft`, `chatService`, `axios` 및 표적 테스트 | 캡션 없는 전송·실패 복원·방/세션 격리·Blob 폐기·공통 사진/버튼 표면·포털 Escape 충돌 차단 |
| GET 쓰기 분리 | 채팅 controller/service/transport, `NoticeService/Repository/Controller`, `CommunityService/Controller` 및 경계 테스트 | 조회에 방 생성/읽음/조회수 쓰기를 넣지 않고 POST에 명시 |
| 목록 로딩 | `RouteLoadingSkeleton`, `routeSkeletonKind`, `BenefitListSkeleton`, `Benefits`, `useViewModeParam`, `utils/viewMode`, `feature-surfaces.css` 및 표적 테스트 | 실제 목록의 폭/타이틀/개수/그리드/저장된 view 일치 |
| 배포/관측 | `CICD.yml`, blue/green compose, `verify-post-deploy-readonly.sh`, `collect-metrics.sh`, hardware dashboard, nginx | 새 선택적 secret 전달·기존 스키마 검사 복원·새 스키마 선택 검사·CPU 의미 분리·캐시 후보 |
| 기준선/문서 | `audit-preview-release.mjs`, README, current-status/history, architecture/backup/deployments/monitoring/structure/manual-ddl/quality-roadmap | 경로/hash 기준선, 실제 운영 완료와 후보/과거 증거 분리 |

기존 광고 디자인·컴포넌트와 보존 snapshot을 다시 만들거나 지우지 않았다. 설치된 스킬/메모리도 변경하지 않았다.
정확한 경로·hash는 외부 `C:/Users/USER/Projects/RESERVE-release-manifests/`의
`2026-09-27-preview-before.json`, `2026-09-27-preview-after.json`에서 확인한다.
이번 변경 경로만 추린 목록은 같은 폴더의 `2026-09-27-changes.md`다. 이 분류는 의존성 폐쇄 검증을 대신하지 않는다.

## 격리 통합 결과 — 앞선 표적 실행

- 작업공간: `C:/Users/USER/.codex/worktrees/reserve-integration/RESERVE`, `feature/v2.6-integration`.
  기준 SHA `eb31d61eddb3a0fbd46a20ca31aad5cc4bdec281`, 공통 조상 `df5451c14edcd974c5248e44962f2b18dce1b78d`.
- 외부 `2026-09-27-integration-plan.json`은 864개 입력 경로·SHA-256·기능 묶음을 고정한다.
  커밋된 프리뷰와 dirty 변경을 함께 비교했고, 78개 3-way 충돌 파일은 최신 dev 회귀를 보존해 해결했다.
  결과/해시/충돌 선택은 `2026-09-27-integration-after.json`에 기록한다. 원본 HEAD·staged 0은 보존했다.
  이후 요청한 모션·검사·문서 변경은 원본 프리뷰에도 반영했고, 후보의 커밋 manifest와 최신 실행 기록으로 구분한다.
- 최신 dev의 refresh 회전/401 cookie 정리/logout 폐기 테스트, transient 로그인 재시도,
  환불 금액 상한, session fencing, DOM 기반 지도 overlay, 계정·v2.6.0~v2.6.3 배포 이력을 유지했다.
- 신규 클래스/설정/이미지 의존성을 이식했고, 백엔드 main/test 컴파일 및 프론트 production 모듈 그래프가 통과했다.
  사용되지 않는 `ChatLauncher`와 빈 아이콘 README만 후보에서 삭제했다(원본/Git 복구 가능).
  Claude outputs와 설치된 skill/memory는 원본에 보존하며 일괄 정리하지 않는다.
- 이식 중 중복 예약 필터/페이지네이션과 누락된 가게 문의 navigate를 바로잡았다.
  초기 bundle 초과는 관리자 skeleton을 형제 파일로 분리하고 react-dom/client 경계만 수정했다.
  같은 UI를 유지하며 초기 gzip **326.8KiB**, 최대 청크 **544.3KiB**로 예산 350/600KiB를 통과했다.
- `preserve-frontend-assets.sh`는 staging에 live와 보존된 릴리스 하나의 **원래 해시 자산만** 이식한다.
  SHA-256 충돌은 덮어쓰지 않고 실패시키며, 소유 manifest로 과거 자산이 무한히 누적되는 것을 막는다.
  nginx route/캐시 계약과 이전 릴리스 디렉터리는 그대로다. Linux fixture drill은 최신 실행에서 통과했고,
  실제 운영 nginx 전환은 아직 관문이다.

| 실행 검사 | 결과/한계 |
|---|---|
| Gradle compileJava/compileTestJava | 통과 |
| Gradle test 표적 29 suite·175개 | 통과, MySQL/PG/S3 실증 아님 |
| frontend lint:ci 및 skeleton/config lint | 통과 |
| Vitest 표적 22파일·262개 + skeleton 2파일·37개 | 통과; jsdom/의도된 invalid fixture 경고는 있었고 실패는 없음 |
| 정책 테스트/PostCSS/Grafana | 7개/12 CSS파일/대시보드 validator 통과 |
| PC·모바일 Playwright | 전용 4273 포트에서 20/20 통과, mock API·합성 사진; 캡처는 외부 manifest 폴더에 보존 |
| 문서/snapshot | 최종 링크 345개 누락 0, 108/108 source·ZIP 117 entry/전체 해시 일치 |
| 배포 스크립트 | YAML/24 shell block/7 script 구문, 해시 자산 보존·충돌·경로 거부, sender_role 타입 관문 5개 검사 통과 |
| production build | 수정 후 npm run build 전체 lifecycle(sitemap/Vite/bundle) 통과; 초기 실패/수정 이력은 종료 manifest에 기록 |
| 미실행 | 전체 suite/CI, Safari/실계정, MySQL 8·TEST PG·실제 S3·Linux cutover/rollback·실서버 fingerprint |

## 공용 인터페이스 변경

| 인터페이스 | 후보 계약/권한 |
|---|---|
| POST `/api/auth/refresh` | `ApiResponse<Void>` + HttpOnly access/refresh cookies, rotation/sliding 유지, JSON token 없음 |
| GET `/api/chat/images/config` | 인증, enabled/maxBytes; 키가 없으면 사진만 false |
| POST `/api/chat/rooms/{roomId}/images` | 인증된 실제 참가자/지원 관리자, multipart image+선택 content+필수 clientMessageId, 한 장 8MiB |
| GET `/api/chat/images/{messageId}` | 인증 참가자(지원 관리자는 지원방), 실제 MIME·no-store·nosniff, S3 key/공개 URL 미반환 |
| GET `/api/admin/chat/reports/{reportId}/images/{messageId}` | ADMIN, 해당 신고 문맥의 메시지에 한정 |
| POST `/api/chat/support/open`, `/stores/{storeId}/open`, `/store-inbox/{roomId}/open` | 기존 UI의 대화 열기/읽음 처리를 옮긴 명시적 쓰기 |
| POST `/api/admin/chat/rooms/{roomId}/open` | ADMIN 고객지원 방 열기/읽음 처리 |
| 대응 GET 채팅 조회 | 생성/읽음 변경 없음, 없는 방은 404. 레거시 `/api/chat/my*`는 호환 예외로 유지 |
| POST `/api/notices/{id}/view` | 공개, IP 제한·없는 ID no-op; 상세 GET은 쓰지 않음 |
| POST `/api/community/posts/{postId}/view` | 기존 community 인증 경계 유지, IP 제한; 상세 GET은 쓰지 않음 |
| 광고 impression/click | 공개 PATCH·유효 광고만 집계, 무효/제한 200 no-op, 참고 지표 |
| 광고 conversion | 인증 PATCH·예약 소유권/같은 가게/24시간/허용 상태 원자 검사 |
| GET `/api/advertisements/my` | Page, 기본20/최대100, 프론트 `page.totalElements` 우선 |

현재 UI는 공지/게시글 상세를 호출하지 않는다. 미래 소비자는 상세 조회 후 별도 POST view를 호출해야 한다.
API shape/보안 호환 변경을 후보 release note에 포함하고 기존 클라이언트/Swagger 소비자를 확인한다.

## DB·환경 변수·IAM

- `chat_message` 신규 사진 컬럼: `image_key`, `image_content_type`, `image_width`, `image_height`, `image_bytes`.
  모두 nullable이며 기존 텍스트 메시지는 NULL을 유지한다.
- 사진 자체는 신규 테이블/인덱스가 없다. 전체 통합 후보는 `chat_room`, `chat_message`, `chat_report`,
  `chat_intro`, `chat_intro_item`, `ad_payment_attempt`와 기존 광고/예약 컬럼·unique/index도 별도로 대조한다.
  refresh의 `previous_token_hash/rotated_at/idx_refresh_token_previous_hash`를 다시 빠뜨리지 않는다.
- FULLTEXT flag는 MySQL 8 DDL·EXPLAIN·LIKE 동등성 전까지 off다. 날짜 백필은 실제 기존 행을 확인하고 승인한 대상만 적용한다.
- 이번 운영 읽기 전용 대조: MySQL 8.0.45·28테이블, 기존 `ad_payment_attempt`/refresh 회전 구조는 이미 있다.
  `chat_report`/`chat_intro`/`chat_intro_item`, 사진 5컬럼·clientMessageId·ownerUnread 등 새 컬럼/index는 없다.
  **chat_message.sender_role가 ADMIN/MEMBER ENUM뿐이라 OWNER 답장 전에 수동 DDL이 필요하다.**
  [수동 DDL 대조 표](manual-ddl.md)에 재생성 불필요/새 변경을 분리했다. 실제 ALTER/CREATE는 실행하지 않았다.
- 신규 선택적 secret: `CHAT_IMAGE_ENCRYPTION_KEY`(표준 Base64 32바이트). 키 유실/교체는 사진 복구 손실이다.
  키 보관/복구 및 장기 사진 보존·삭제 요청 운영 정책을 합의한 뒤 활성화한다. 저장소·채팅·로그에 값을 기록하지 않는다.
  사용자는 GitHub·IntelliJ 등록과 복구본 보관 완료를 확인했다. repository Secret 이름은 확인했고 값은 읽지 않았다.
  새 운영 백엔드 재시작과 config true·실제 사진 왕복은 아직 검증하지 않았다.
  활성화 순서: 보호된 키 생성/보관 → 복구본 읽기 가능 확인 → 승인된 Secret 등록 → 재시작 후 config true·실제 왕복.
  key ID/다중 키 복호화는 현재 없다. OAuth/JWT 키를 재사용하거나 기존 사진 키를 무계획 교체하지 않는다.
- 기존 `TOURISM_API_SERVICE_KEY`, PG/웹훅/QR/SMTP/OAuth/S3 환경 변수는 통합 manifest와 실제 secret 존재를 대조한다.
- 사진 객체: 기존 이미지 버킷 `users/{senderId}/chat/{roomId}/*.bin`(환경 prefix 포함), 지원 avatar `system/chat/support/`.
  기존 S3 GetObject/PutObject/DeleteObject를 재사용한다. 새 AWS 자원/IAM/CloudFront 변경은 하지 않았다.
  고정 인프라를 추가하지 않아도 기존 S3 저장·요청·전송 사용량 요금은 생길 수 있다.
- 공용 이미지 TTL 1일, 해시 없는 public 폰트/이미지 TTL 7일, 해시 `/assets/` 1년 immutable 후보다.
  S3 삭제와 CDN 잔존은 별개다. CloudFront MinTTL·기존 객체 metadata·invalidation IAM/정책은 미검증/미변경이며 즉시 삭제를 보장하지 않는다.

## 검사와 승인 관문

- [x] 프론트 표적 Vitest 66개 + 32개 + 후속 패널 7개 실행 통과(중복 포함), 변경 파일 lint·CSS 파싱·Grafana validator·diff check
- [x] 사진/채팅/보안 backend 배치 60개 통과, 인증·환불·전환·메일 등 추가 표적 검사
- [x] PC·모바일 메신저 브라우저 6/6, 후속 실제 이미지 디코딩·크기·확대/키보드/Escape 확인 2/2(합성 데이터/mock API)
- [x] 별도 승인 후 최신 dev 기반 격리 작업공간·`feature/v2.6-integration` 생성 — 시작 SHA `eb31d61e…`, clean
- [x] 그 후보로 기능별 명시 이식·운영 회귀 대조 — 원본 HEAD·staged 0 보존, 이번 승인으로 기능별 커밋 완료
- [x] 후보의 표적 backend/Vitest·lint·핵심 PC/모바일·production 산출물/bundle·문서/snapshot 검사
- [ ] 버전/키/외부 관문 확정 후 전체 CI 한 번, Safari/실제 계정 최종 확인
- [ ] MySQL 8 잠금·DDL/페이지/거리 쿼리, TEST PG 복귀/PAID 복구/서명 웹훅/동시 환불 단일 PG 호출
- [ ] 실제 S3 사진 왕복/타 계정403/차단/신고 범위, 키 복구·사진 보존/삭제 정책, outbox FAILED→COMPLETED
- [x] 운영 SSH ECDSA fingerprint와 CI pin 일치·현재 blue/SHA·MySQL 구조·기존 backup.env/root cron 읽기 전용 확인
- [x] 실제 서버의 임시 fixture로 Linux cutover/ERR rollback·해시 자산 보존/충돌/경로 거부 drill 통과(운영 nginx 미변경)
- [ ] 승인 후 릴리스/배포, 고유 operation-guide/content-sources 본문+sitemap, 로그아웃/사진/결제 복구 smoke
- [ ] 승인 후 Grafana 실패 알림 실제 수신, collector 먼저 적용→새 CPU 시계열→dashboard, CSP Report-Only 7일 관측

읽기 전용 스키마 확인은 `RESERVE_VERIFY_PREVIEW_SCHEMA=1`인 경우에만 새 후보 테이블·사진 컬럼까지 요구한다.
이 플래그를 현재 운영 v2.6.3에 켜서 아직 없는 테이블을 실패로 판단하지 않는다.

Rollback 후보는 새 프론트를 staging만 하고, 비활성 backend health 후 새 절대 root+upstream을 한 번에 reload한다.
실패 시 이전 두 nginx 설정과 포인터를 복구하고, smoke 전에 이전 backend를 중단하지 않는다.
이전 브라우저가 뒤늦게 요청하는 옛 lazy chunk는 staging의 해시 자산 보존으로 대응한다.
이전 디렉터리만 보존하는 방식은 부족했다. 복사/소유 manifest/충돌 거부 로컬 검사는 통과했지만,
실제 서버에서 옛 문서의 JS/CSS/font 요청과 nginx cutover 전후의 동작은 별도로 검증한다.
관문에서 실패하면 릴리스를 보류하고 인프라/DB를 자동 복원하거나 LIVE PG를 쓰지 않는다.

## GitHub Release·공동 작성 배지

- v2.4.0/v2.4.1 태그는 있지만 Release가 없다. 생성과 release-note/deployment 보완은 승인 후 수행한다.
- 병합 PR 184개를 조회했고 PR별 commit 추가 페이지까지 확인한 Claude 관련 정정값은 **15개(#210~#224)**다.
  기본 dev 대상은 12개, main 대상은 3개다. #212 원본에도 Claude가 있으며 #217/#222는 원본과 squash 둘 다 있다.
  앞선 14개 집계와 squash-only 설명은 100개 페이지 제한을 끝까지 조회하지 않은 오류였다.
- 프로필 Pair Extraordinaire는 현재 기본 이미지이며 표시된 최초 기록은 #182·@dependabot이다.
  실제 GitHub 내부 인정 횟수는 공개되지 않아 15나 12를 배지 카운터라고 단정하지 않는다.
  GitHub 직원의 9/23 획득·표시 지연 공지를 확인했다. 이 계정의 원인 확정이나 발급 시점 보장은 아니다.
  [후속 심층 조사](history/2026-09-preview/github-coauthor-audit-2026-09-27.md)에 PR별 증거·공식 Codex 표기·이력 재작성 위험·사진 비활성 원인을 기록했다.
- 배지는 계정 전체 누적이며 Claude용/다른 도구용 메달을 따로 발급하는 설정이 아니다.
  실제 기여와 GitHub에 연결된 주소를 확인해 [공식 공동 작성 규칙](https://docs.github.com/en/pull-requests/how-tos/commit-changes/creating-a-commit-with-multiple-authors)을 따른다.
  AI 작업이 있었다는 사실과 배지 인정 여부는 다르다. 임의 계정/이메일·빈 커밋·과거 재작성으로 배지를 보장하지 않는다.
- #110/#162는 닫혔다. #199/#168/#165/#164 등 의존성 PR은 제품 통합과 분리하며 강제 설치/ignore-scripts를 사용하지 않는다.
