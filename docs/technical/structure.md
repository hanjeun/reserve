# 코드 구조

모노레포 폴더 구조, 라우트, 환경변수를 정리했어요.

## 모노레포 루트

```
RESERVE/
├── backend/
├── frontend/
├── nginx/
│   └── default.conf              ← Nginx 설정 (SSL, upstream, SPA, 캐시 헤더)
├── docs/
│   ├── guide/
│   │   ├── user-guide.md         ← 손님 가이드
│   │   └── owner-guide.md        ← 사장님 가이드
│   ├── rules/
│   │   ├── git-workflow.md       ← 브랜치 전략, 커밋 규칙, 릴리즈
│   │   └── code-conventions.md   ← 네이밍, 로그, PropTypes 컨벤션
│   └── technical/
│       ├── architecture.md       ← 인프라 구조 · 배포
│       ├── monitoring.md         ← Grafana · Loki · Sentry · UptimeRobot
│       ├── payments.md           ← 결제 · 환불 · 웹훅 inbox · 대사 큐
│       ├── data-lifecycle.md      ← 탈퇴 · 폐업 · 파일 삭제 outbox · 보존 정책
│       ├── account-security.md    ← 비밀번호 · 세션 세대 · 로그인 유지(refresh 회전) · 동의 이력 · OAuth unlink outbox
│       ├── store-drafts.md        ← 가게 등록·수정 IndexedDB 임시저장
│       ├── messaging.md          ← 고객지원·가게 문의 권한 · 전송 안정성 · 확장 관문
│       ├── region-photo-assets.md ← 지역 대표 사진 · 공공누리 출처 · 가공 기준
│       ├── backup.md             ← MySQL 백업 · 복원 훈련
│       ├── deployments.md        ← 릴리스 · 배포 · 배포 후 검증
│       ├── manual-ddl.md         ← ddl-auto가 만들지 못하는 운영 DDL
│       ├── ui-decisions.md        ← 공통 UI 구현 결정
│       ├── README.md              ← 기술 문서 안내
│       ├── structure.md          ← 코드 구조 (이 문서)
│       └── design-system.md      ← 디자인 토큰 · 공통 컴포넌트
├── .github/
│   ├── workflows/CICD.yml        ← dev/main PR 검사 · main push Blue/Green 배포
│   ├── workflows/pr-labels.yml   ← PR 제목·경로로 라벨 자동 부착
│   ├── workflows/cache-cleanup.yml ← 닫힌 PR 의 Actions 캐시 삭제
│   ├── ISSUE_TEMPLATE/           ← 버그/기능 이슈 폼
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml            ← 의존성 자동 업데이트 (npm · gradle · actions)
├── docker-compose-blue.yml       ← Blue 컨테이너 (8080:8080)
├── docker-compose-green.yml      ← Green 컨테이너 (8081:8081)
├── THIRD_PARTY_NOTICES.md        ← 서드파티 라이선스 고지
└── README.md
```

`docs/technical/`의 전체 문서 목록은 [기술 문서 안내](README.md)에 있어요.

## 백엔드 (`backend/src/main/java/kr/it/reserve/`) — 20개 패키지

진입점은 `kr/it/reserve/ReserveApplication.java`예요.

```
kr.it.reserve/
├── config/
│   ├── SecurityConfig.java        ← Spring Security, CORS, JWT 필터, permitAll 규칙
│   ├── WebMvcConfig.java          ← MVC 설정
│   ├── AsyncConfig.java           ← 비동기 스레드풀 (이미지 병렬 업로드 등)
│   ├── controller/                ← AuthApiController (로그인/회원가입/토큰)
│   ├── jwt/                       ← TokenProvider, JwtAuthenticationFilter, authVersion 세션 세대
│   │   └── scheduler/             ← RefreshTokenCleanupScheduler (만료 refresh 토큰 정리)
│   ├── oauth2/                    ← OAuth2 핸들러, CustomOAuth2UserService, 탈퇴 연동 해제 outbox
│   └── service/                   ← TokenService (refresh 회전·거절 사유 로그), RefreshRejectedException
│
├── member/                        ← 회원 관리 (프로필, 위치, 비식별 탈퇴, 비밀번호 변경), PasswordResetController,
│                                     마케팅 동의 이력
├── lifecycle/                     ← 탈퇴·영업 종료 전 미결 예약/결제 의무 단일 관문
├── store/                         ← 가게 등록/수정/영업 종료/조회, AddressController(주소검색 프록시)
│   └── service/StoreRepository    ← findByIdForUpdate() 비관적 락(PESSIMISTIC_WRITE) — 예약 동시성 제어
├── file/                          ← 실바이트 이미지 검증 + S3 업로드 + 삭제 outbox/재시도 스케줄러
├── reservation/                   ← 예약 생성/승인/취소/완료/수정(PATCH), 실시간 availability
│   ├── scheduler/                 ← 미결제 예약 자동 만료
│   ├── util/                      ← ReservationCodeGenerator(R-날짜-XXXX), QrCheckinTokenProvider(HMAC)
│   └── ReservationCodeBackfillRunner  ← 기존 예약에 코드 백필 (앱 기동 시 1회)
├── payment/                       ← 포트원 V2 결제·환불 + 웹훅 inbox·오래된 READY 관리자 대사
├── advertisement/                 ← 유료 광고 (노출형/BADGE·배너형/BANNER), 포트원 결제 재사용
│   ├── scheduler/                 ← AdvertisementExpiryScheduler(만료), AdCounterFlushScheduler
│   └── service/AdCounterBuffer    ← 노출/클릭 카운터 인메모리 버퍼링 후 주기적 flush
├── review/                        ← 리뷰 작성/수정/삭제
├── favorite/                      ← 즐겨찾기 토글/조회
├── business/                      ← 사업자 인증 신청/심사
├── waiting/                       ← 고객 현장/원격·직원 접수, 호출·입장·취소, 동의·소유권·접수번호·종료 자료 정리
├── inquiry/                       ← 1:1 문의 (회원/비회원 게스트, category enum, 관리자 답변)
├── mailbox/                       ← 관리자 메일 발송(Resend) — 보낸 메일함 (인바운드 없음)
├── notice/                        ← 공지사항 등록/조회
├── audit/                         ← 감사 로그 + 휴지통(소프트 삭제·복구),
│                                     AdminManagementController(회원/가게 정지·차단),
│                                     TrashCleanupScheduler
├── security/                      ← CSP Report-Only 위반 보고 수집(PII 제거 로그)
├── seo/                           ← 공개 정적 URL + 활성 가게 상세 동적 sitemap
├── email/                         ← 이메일 인증 코드 발송/검증
├── community/                     ← 게시판 — 프론트 미노출. Member/Store cascade 삭제가 참조해 존치
├── promotion/                     ← 가게 소식 정본·저장/조회·게시 연동 인터페이스 (광고 advertisement와 별개)
├── feed/                          ← SNS 공개 프로필·글/사진·신고/감사·30일 파기 (로컬 구현, 운영 미적용)
│   └── news/{controller,dto,service}/ ← 소식 작성/관리·피드 게시 조합, 기존 promotion API 경로 유지
├── common/                        ← HealthCheckController
├── main/                          ← (빈 패키지 — 잔재)
└── global/
    ├── common/                    ← ApiResponse 공통 포맷
    ├── error/                     ← GlobalExceptionHandler + BusinessException 상속 도메인별 예외
    │                                (Member/Store/Reservation/Advertisement/Audit/... Exception)
    └── ratelimit/                 ← Bucket4j IP rate limiting (주소검색 등)
```

### 설정 파일 (`backend/src/main/resources/`)

```
application.yml          ← 프로파일 지정
application-common.yml   ← 전 환경 공통 (JPA, Mail, JWT, HikariCP)
application-local.yml    ← 로컬 개발 (localhost MySQL, redirect URI)
application-prod.yml     ← 운영 (Docker MySQL, 배포 도메인)
application-blue.yml     ← Blue 컨테이너 포트 (8080)
application-green.yml    ← Green 컨테이너 포트 (8081)
application-secret.yml   ← 민감 정보의 ${ENV_VAR} 플레이스홀더. 레포에 추적되는 게 정상
```

`application.yml`이 secret 프로파일을 include해요. `application-secret.yml`에는 `${ENV_VAR}` 플레이스홀더만 두고, 실제 값은 배포 환경변수로 주입돼요.

## 프론트엔드 (`frontend/src/`)

```
src/
├── api/axios.js              ← Axios 인스턴스 (JWT, refresh 재시도, SessionExpiredError)
│
├── components/
│   ├── common/               ← 아래 "공용 컴포넌트 전체 목록" 참고
│   ├── admin/                ← MembersTab, StoresAdminTab, ReservationsAllTab, DashboardTab,
│   │                            AuditLogTab, TrashTab, MailboxTab, AdminAdsTab,
│   │                            BusinessVerificationTab, PaymentOperationsTab, SanctionModal
│   │                            (AdminPanel이 탭 위임)
│   ├── business/             ← 사장님 패널 탭 (예약 관리, 통계)
│   ├── advertisement/        ← AdBanner(배너 노출), AdManageTab(광고 등록/결제)
│   ├── reservation/          ← ReservationStatusBadge, ReservationCard, ReservationRow,
│   │                            ReservationMeta, ReservationDetailModal,
│   │                            QrCodeModal(손님 QR), QrScannerTab(사장님 스캔)
│   ├── review/               ← ReviewList
│   ├── store/                ← StoreCard, StoreForm/ (AddressSearch, StoreImages)
│   ├── layout/               ← Header, Footer, OfflineBanner(오프라인 감지 배너)
│   └── PrivateRoute.jsx      ← 권한 가드
│
├── constants/               ← api, categories, roles, status, index
│
├── hooks/
│   ├── queryKeys.js          ← TanStack Query 키 팩토리 (신규 쿼리는 여기부터)
│   ├── invalidateAfterWrite.js ← 쓰기 후 캐시 무효화 규칙 (신규 mutation은 여기서 고름)
│   ├── useImagePreview.jsx   ← Image.PreviewGroup 기반 미리보기 (닫힘 애니·멀티)
│   ├── useExitAnimation.js   ← 닫힘 트랜지션 공통 훅
│   ├── useQueryParamState.js ← 관리자 탭 URL 쿼리스트링 동기화
│   ├── useRouteSeo.js        ← 공개 경로 allowlist·robots·query 없는 canonical/OG URL
│   ├── useStoreImageHint.js  ← 상세 스켈레톤용 이미지 비율 힌트
│   ├── useStoreForm.js       ← 등록·수정 공통 폼 + IndexedDB 자동/수동 임시저장
│   ├── useOnlineStatus.js    ← 온라인/오프라인 감지 (useSyncExternalStore)
│   ├── useAdPayment.js       ← 광고 결제 플로우
│   ├── usePayment.js         ← 예약 결제 플로우 (포트원)
│   ├── useManageReservations.js / useReservations.js / useStoreData.js /
│   │   useStoreDetailActions.js / useStoreForm.js / useStoreList.js / useMyStores.js
│   └── useDebounce, useDocumentTitle, useEmailVerification, useFormReady,
│       useMessage, useWindowWidth, index
│
├── pages/
│   ├── admin/                ← AdminPanel (탭 구현은 components/admin/)
│   ├── auth/                 ← Login, Signup, OAuthCallback, ForgotPassword, SocialAgreement
│   ├── business/             ← BusinessPanel (예약 관리 · 통계 · 광고)
│   ├── favorite/             ← 즐겨찾기
│   ├── Home/                 ← 랜딩 페이지 (hooks/, sections/)
│   ├── legal/                ← Terms, Privacy
│   ├── member/               ← 마이페이지 (프로필 · 위치)
│   ├── payment/              ← 결제 결과 (예약/광고 분기)
│   ├── reservation/          ← 내 예약
│   └── store/                ← 가게 목록/상세/등록/수정
│
├── services/                ← 도메인별 API 레이어: adService, businessService, favoriteService,
│                               memberService, paymentService, reservationService,
│                               reviewService, storeService
├── store/
│   ├── useAuthStore.js       ← Zustand (로그인 상태) — 401/403/세션만료 때만 로그아웃
│   └── useLocationStore.js   ← 세션 한정 라이브 위치 (우리동네 배지용)
├── styles/
│   ├── global/               ← foundation, forms, navigation, interactions, feature surfaces
│   ├── theme.css             ← 라이트/다크 CSS 변수
│   └── tokens/               ← colors, typography, spacing, field, animations, chart
├── utils/                   ← image, form, errorHandler, validation, storeDraftStorage,
│                               imageUploadPolicy, distance,
│                               adAttribution, imageHintCache, paymentWindowGuard,
│                               redirect, index
├── App.jsx                  ← 라우터(라우트 lazy 코드분할) + ConfigProvider + AntApp
├── index.css                ← 전역 CSS 진입점(styles/global/*.css import)
└── main.jsx
```

### 공용 컴포넌트 전체 목록 (`components/common/`)

`Avatar, Badge, Button, Card, ChartCard, DataTable, FavoriteButton, FilterMenu, FilterToolbar,
FormDatePicker, FormInput, FormModal(+FormField), FormSelect, FormTextArea, FormTimePicker,
ImagePreviewPortal, InquiryModal, KakaoMap, Loading(+ArcSpinner/SpinIndicator), ModalLoading,
PageContainer, PieLegend, RefreshButton, SegmentedControl, SegmentedGrid, Skeletons(Bone 외),
StatCard, UnreadPill, pickerSuffix, index.js`

목록 필터는 `FilterMenu`, 폼 선택 필드는 `FormSelect`를 사용해요. 옛 `FilterSelect`는 호환용으로만 남아 있어요.

공유 컴포넌트는 [코드 컨벤션](../rules/code-conventions.md) 기준 **PropTypes 필수** 대상이에요. 사용법은 [디자인 시스템](design-system.md)에 있어요.

### 초기 번들 경계

- 라우트는 `App.jsx`에서 lazy 로드해요. 비회원도 항상 보는 Header/Footer는 인증 계정 메뉴와 `InquiryModal`을 필요할 때만 가져와요.
- 앱 셸에서는 `hooks/index.js`·`components/common/index.js` barrel 대신 직접 import해요.
- `npm run build`의 postbuild가 `scripts/check-bundle-budget.mjs`를 실행해요.

| 예산 | 한도 |
|---|---|
| 단일 JS 원본 크기 | 600 KiB |
| HTML이 직접 연결하는 초기 JS 합계 (gzip) | 350 KiB |

전송 압축은 `nginx/default.conf`에서 JS·CSS·HTML·JSON을 gzip으로 보내요.

## 라우트

| 경로 | 페이지 | 권한 |
|---|---|---|
| `/` | 홈 | 공개 |
| `/search` | 검색 전용 화면 | 공개 |
| `/stores` | 가게 목록 | 공개 |
| `/benefits` | 관리자 승인된 가게 소식·혜택 목록 · 사진 첨부 신청/내 소식 관리 (로컬 후보) | 공개 승인분 조회 · 관리 본인 사업자 |
| `/waiting` | 출시된 고객 웨이팅 가게 탐색 · 현장/원격 접수 | 탐색 공개 · 접수 로그인 |
| `/feed` | 모든 회원의 SNS 목록·지역/관심 가게 필터·내 게시물/초안 (로컬 구현, 운영 미적용) | 조회 공개 · 작성/개인 필터 로그인 |
| `/feed/posts/:id` `/feed/u/:publicId` | 게시물 상세·공유 주소 / 독립 공개 닉네임 프로필·작성자 게시물 (운영 미적용) | 공개 글·프로필만 조회 |
| `/feed/notifications?view=all\|unread&page=1` | 댓글·답글·댓글 좋아요 알림·읽음 관리 (로컬 후보) | 본인 로그인 |
| `/store/:id` | 가게 상세 · 예약 · 리뷰 | 공개 |
| `/login` `/signup` | 인증 | 비로그인 |
| `/forgot-password` | 비밀번호 재설정 | 비로그인 |
| `/oauth2/callback` | 소셜 로그인 콜백 | 비로그인 |
| `/signup/social` | 소셜 회원가입 추가 동의 | 비로그인 |
| `/terms` `/privacy` | 약관/개인정보 | 공개 |
| `/content-sources` | 콘텐츠 출처·권리 안내 | 공개 |
| `/operation-guide` | 예약·가게 운영 흐름 안내 | 공개 |
| `/guide/user` `/guide/business` `/guide/common` | 손님 · 사장님 · 공통 이용안내 (`/operation-guide`는 공통 안내로 이동) | 공개 |
| `/my-reservations` | 내 예약 · `?tab=waiting` 내 웨이팅 | 로그인 |
| `/my-favorites` | 즐겨찾기 | 로그인 |
| `/my-page?tab=name\|password\|photo\|public-profile\|location\|business` | 마이페이지·공개 프로필 설정. 비밀번호는 이메일 회원, 사업자 전환은 일반·사업자 회원 | 로그인 |
| `/messages` | 메시지 | 로그인 |
| `/my-stores` | 내 가게 관리 | BUSINESS / ADMIN |
| `/store/register` | 가게 등록 | BUSINESS / ADMIN |
| `/store/:id/edit` | 가게 수정 | BUSINESS / ADMIN |
| `/drafts/transfer` | 계정별 가게 등록·수정 초안의 사진 포함 내보내기/가져오기 | BUSINESS / ADMIN |
| `/business?tab=…` | 사업자 작업 공간 (예약 · 웨이팅 · QR 체크인 · 가게 소식 · 채팅 관리 · 광고 · 통계) | BUSINESS / ADMIN |
| `/admin?tab=…` | 관리자 작업 공간 (운영 현황 / 인증·문의·신고 / 결제·광고 / 시스템) | ADMIN |
| `/payment/result` | 결제 결과 (예약/광고) | 로그인 |

관리자·사업자는 `WorkspaceLayout`의 PC 왼쪽 메뉴와 900px 미만의 메뉴 버튼·서랍을 공유해요. 기능 이동은 history에 추가하고 필터·페이지 변경과 잘못된 주소 보정은 replace해요. 로그인 복귀는 기존 경로·쿼리·해시를 보존하고, 역할 검사는 `PrivateRoute`와 서버에서 계속 수행해요.

피드·소식 신고는 `reportMode=reports|comments|audit`와 각 목록의 `reportStatus`·`reportPage` / `commentReportStatus`·`commentReportPage` / `reportAuditPage`를 주소에 보관해요. 혜택 심사는 `benefitState`·`benefitPage`, 채팅 신고는 `chatReportStatus`·`chatReportPage`를 사용해요. 현재 목록의 기본 선택과 페이지도 표시해요. 관리자에서 숨겨진 작업의 URL 조회값은 고정하며 이전 요청의 페이지 보정으로 현재 기능의 주소를 덮어쓰지 않아요.

QR은 `tab=qr-checkin&qrReturn=…`에 열기 전 기능의 필터를 보존해요. 이 화면에서 연 QR은 닫을 때 바로 이전 작업으로 돌아가고, 직접 진입·로그인 복귀로 연 QR은 같은 필터를 가진 복귀 기능으로 replace해요. 광고 결제 결과의 `/business?tab=ads` 복귀 주소는 유지해요.

작업 공간의 작성·검토 폼은 `WorkspaceNavigationProvider`에 실제 미저장·처리 중 상태를 등록해요. 메뉴·헤더·같은 탭의 링크·뒤로가기에서 입력을 유지하거나 버릴 수 있고, 처리 중에는 사용자 이동을 막아요. 새로고침·다른 문서 이동은 브라우저의 beforeunload 확인을 사용해요. 광고 결제 중에는 SDK의 모바일 문서 리다이렉트를 허용하되 메뉴 이동은 계속 막아요. 인증 만료·강제 로그아웃은 입력 확인을 기다리지 않으며 세션 변경 시 보류 중인 이동을 취소해요.

### sitemap과 색인

- `/sitemap.xml`은 SPA 라우트가 아니라 Nginx가 백엔드 `SitemapController`로 넘기는 공개 시스템 엔드포인트예요. 정적 URL과 활성·미삭제 가게 상세만 넣고 최대 50,000 URL로 제한해요.
- 프론트 `useRouteSeo`도 같은 공개 집합(`/`, `/stores`, 숫자형 `/store/:id`, `/terms`, `/privacy`, `/content-sources`, `/operation-guide`)만 `index, follow`로 두고 나머지는 `noindex, nofollow`예요.
- canonical과 `og:url`에는 쿼리·해시를 넣지 않아요.

## API 버전과 URL 복구

- 모바일 홈·탐색·혜택·웨이팅·피드는 큰 가로 스와이프 한 번으로 인접 탭을 이동하는 로컬 구현을 사용해요. 끝에서 순환하지 않으며 가장자리 뒤로가기·세로 스크롤·핀치·입력·사진·가로 목록·열린 모달/메신저를 보호해요. 탭 클릭도 같은 목적지 관문을 사용하고 탭별 쿼리와 스크롤을 세션에 기억해요. 실제 로딩 골격이 끝난 뒤 스크롤을 복원하며 사용자가 스크롤을 시작하면 복원을 중단해요. 10/12에 자동 브라우저·빌드 등 배포 준비 검사를 실행했으며 일반 화면·실기기 사용감 확인은 별도로 남아요.

- `ApiVersionConfiguration`은 기존 `/api/...` 컨트롤러의 같은 동작을 `/api/v1/...`에도 매핑해요. 기존 주소는 유지하고 요청 URI를 내부적으로 바꾸지 않아요.
- `ApiPaths`가 공개·관리자·CSRF 경로의 두 버전을 함께 확장해요. `/api/v2/...`처럼 지원하지 않는 숫자 버전은 인증 화면 대신 JSON 404로 끝나요. OAuth 진입·콜백과 `/actuator/health`는 기존 경로를 유지해요.
- 프론트 `apiVersion.js`는 `VITE_API_VERSION=v1`일 때 `/api/...` 요청에 v1을 붙여요. 인증·세션 판정에는 `canonicalApiPath`를 사용하며 legacy·v1 요청도 같은 갱신 대기열을 공유해요.
- 로컬 기본값은 `legacy`예요. CI의 운영 빌드는 `v1`을 넣고, v1을 지원하는 백엔드와 같은 릴리스에서 함께 전환해요. 구 백엔드만 실행하는 로컬 환경은 `legacy`를 유지해요.
- `/stores`, `/my-stores`, `/my-favorites`, `/my-reservations`, `/waiting`, `/benefits`, `/feed`, `/feed/u/:publicId`의 목록 쿼리는 `normalizeListQueryParams` 관문에서 지원 옵션으로 정리해요. 알 수 없는 키·불필요한 빈 입력·잘못된 정렬·중복 옵션·유효하지 않은 좌표를 제거하고 현재 선택을 보충해요. 카드·목록, 정렬·상태·탭·대상 종류·혜택 기간·페이지는 기본 선택도 표시해요. 전체 분야·전체 지역은 빈 선택값(`domain=`·`region=`)을 유지하며, 기억된 지역과 자동 선택된 사업자 가게도 실제 화면의 값을 표시해요. 관리 목록은 활성 작업·현재 하위 목록의 기본값만 보충하고 다른 작업의 상태를 건드리지 않아요. 주소 보정은 replace로 처리해 뒤로가기 기록을 늘리지 않아요. `utm_*`의 지정 키·`gclid`·`fbclid`를 유지하고 로그인·결제 복귀용 쿼리와 대기 토큰 해시는 이 목록 정리 관문의 대상이 아니에요.
- 모바일 `/messages`는 사이트 헤더·푸터와 헤더 로딩 자리를 렌더하지 않고 메신저 자체 화면으로 보이는 전체 높이를 사용해요. 메신저의 X는 기존 닫힘 모션 후 이전 앱 화면으로 돌아가고, 앱 내 기록이 없는 직접 진입은 홈으로 replace해요. PC 진입은 기존 화면의 메시지 패널로 넘겨요.
- 상세 조회의 삭제·없는 대상(404/410)은 대상 없음 안내와 목록 이동을 제공해요. 목록 API 404는 기능 경로 실패로 구분하고, 네트워크·403·5xx는 해당 실패 안내와 재시도를 제공해요. `DataState`의 `requestType="detail"` 계약을 사용해요.

## 환경변수

### 프론트엔드 (`frontend/.env.local`)

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_API_VERSION=legacy
VITE_PORTONE_CHANNEL_KEY=your_channel_key
VITE_SKELETON_DELAY=0
```

### 백엔드 (`backend/src/main/resources/application-secret.yml`)

로컬에서는 직접 만들고, 운영에서는 GitHub Secrets → Docker Compose 환경변수로 자동 주입돼요.

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          google:   { client-id: ..., client-secret: ... }
          naver:    { client-id: ..., client-secret: ... }
          kakao:    { client-id: ..., client-secret: ... }

jwt:
  secret-key: YOUR_JWT_SECRET

qr:
  token-secret: YOUR_OPTIONAL_QR_SECRET # 비우면 JWT 키에서 용도별 HMAC 파생

mail:
  username: resend
  password: YOUR_RESEND_API_KEY

portone:
  v2-secret: ...        # PORTONE_V2_SECRET  — REST API 인증 시크릿
  store-id: ...         # PORTONE_STORE_ID   — 상점 ID (결제창·취소 양쪽에서 쓴다)
  webhook-secret: ...   # PORTONE_WEBHOOK_SECRET — 웹훅 서명 검증용 (whsec_ + base64)

tourism:
  api:
    service-key: ...    # TOURISM_API_SERVICE_KEY — 지역 대표 관광 사진 서버 조회 전용

S3_BUCKET_NAME: YOUR_S3_BUCKET
CLOUDFRONT_DOMAIN: YOUR_CLOUDFRONT_DOMAIN
AWS_REGION: ap-northeast-2
AWS_ACCESS_KEY_ID: YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY: YOUR_SECRET_KEY
```

### 추가 환경변수

- **피드 신규 로컬 구현·운영 미적용:** `FEED_ENABLED` 기본값은 false예요. 새 피드 모델은 flag와 별개로 Hibernate validate 대상이므로 운영 활성화 전에 `manual-ddl.md`의 새 절과 복구 입력을 승인해야 해요. 로컬 프로필은 Git 밖의 `${user.home}/.codex/local-data/RESERVE/local.properties`를 선택적으로 읽어요. 이 PC에 로컬 활성화 값과 별도 `FEED_IMAGE_ENCRYPTION_KEY`를 준비했으며 채팅 키는 보존해요. 운영 키 생성·주입은 하지 않았어요. 로컬 새 피드·가게 소식 사진은 같은 폴더의 `feed-images/`에 암호문으로 저장하고, `local-feed/users/{id}/feed/images/{uuid}.bin` 키로 기존 권한 검사·파일 삭제 outbox를 사용해요. 기존 S3 사진은 옮기지 않으며 공개 사진도 글의 현재 공개 상태를 확인한 피드/혜택의 각 사진 API에서만 읽어요.
- 피드 작성은 먼저 공개 닉네임을 정하고 현재 계정 사진 공개는 명시적으로 선택해요. 글·사진·가게 연결·초안·실제 게시물 미리보기는 feed 화면의 지연 청크에 있어요. 임시저장은 피드 왼쪽 폴더 또는 보기 메뉴에서 열며 같은 폴더를 다시 누르면 최신 목록으로 돌아와요. 가게·피드·혜택·댓글의 좋아요를 통합 화면에서 대상별 기록으로 보고, 피드 댓글·한 단계 답글·사진 최대 6장·본인 수정/삭제·신고·관리자 숨김·알림은 별도 API를 사용해요. 팔로우·영상은 후속이며 기존 community API 연결을 피드 완료로 취급하지 않아요.
- 혜택의 작은 회색 아이콘은 가게 소식 작성기 직접 열기와 내 소식 관리로 구분해요. hover·키보드 포커스·접근 가능한 이름으로 뜻을 제공하고, 작성 상태 확인 중·실패·미활성화는 이유를 표시해요. 작성 청크는 같은 EditorDialog 안에서 불러오며 혜택에는 공개 닉네임 단계가 없어요. 공개 닉네임·소개·피드 사진 설정은 `/my-page?tab=public-profile`에 모으고 본인 공개 프로필의 수정 버튼도 같은 설정으로 연결해요. 피드 사진은 기존 계정 사진 교체 UI 한 개를 재사용하며 새 프로필의 기본값은 계정 사진이에요. 별도 피드 사진은 계정 사진과 독립적으로 저장하며 기존 비공개 선택은 유지해요. 처음 글쓰기의 닉네임 단계는 작성기 안에 유지해요.
- Redis는 운영 이식 전 로컬 시험과 운영 준비를 구분해요. `docker-compose-local-redis.yml`은 loopback, 준비용 `docker-compose-redis.yml`은 호스트 포트 없이 기존 `app-network`만 사용하며 Git 밖의 전용 암호·`redis.conf`를 읽어요. `RESERVE_REDIS_ENABLED` 기본값은 false예요. local/운영 혼합 프로필을 차단하고 로컬은 loopback, prod/blue/green은 명시한 내부 endpoint만 허용해요. `RESERVE_REDIS_HOST`·`PORT`·`PASSWORD`와 선택 `USERNAME`은 Blue/Green Compose·CI로 전달하며, key/PubSub namespace는 local/prod로 코드에서 분리해요. 웨이팅 변경·`WAITING_JOIN`/`QR_CHECKIN` 공유 제한과 함께 공통 화면 식별 신호의 `RedisEntityUpdateRelay`도 후보에 구현했어요. MySQL 트랜잭션·제약·번호·중복 방지·호출·입장은 유지해요. 실제 연결·제한·유한 fallback·환경 격리와 10/16 공통 중계의 확인 범위는 [아키텍처](architecture.md#로컬-피드-사진과-redis-운영-이식-준비)를 따라요. 운영 Redis는 설치·활성화하지 않았어요.
- 활성 OAuth 토큰 암호화는 `OAUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED=false`가 기본이고 전용 `OAUTH_PROVIDER_TOKEN_ENCRYPTION_KEY`를 사용해요. Google/Kakao/Naver 보안 사건 수신 플래그도 기본 false이며 실제 공급자 설정은 변경하지 않았어요. 후속 후보는 subject 잠금·미가입 cutoff·JWT/refresh의 불변 원인증·성공 핸들러의 한 트랜잭션 발급과 개인 SSE 재검사를 포함해요. Naver는 기존 로그인 Client ID/Secret을 사용하며 새 시크릿을 만들지 않아요. `KAKAO_APP_ID`는 후보의 검증 설정이고 실제 등록을 지시하지 않아요. 새 스키마·키 복구와 지원 경계는 [계정 보안](account-security.md)·[DDL 16절](manual-ddl.md#16-oauth-토큰-보호와-공급자-보안-사건-후보-운영-미적용)을 따라요.
- 가게 소식은 혜택 탭과 파트너 패널에서 같은 편집 화면을 열어요. `STORE_NEWS_ENABLED`는 `FEED_ENABLED`와 독립이고 기본값은 false, 로컬 프로필은 true예요. `/api/store-news/config`와 승인된 사진의 `GET /api/store-news/media/{id}`는 공개 경로이며 사진 업로드와 stores/me/상세/CUD는 현재 회원·사업자·가게 소유권을 확인해요. 제목·본문·최대 6장 사진·임시저장·혜택 목록/상세 미리보기·수정/삭제, 소식/공지/행사/혜택과 행사·혜택 기간/선택 조건을 포함해요. 사진 1~6장과 관리자 승인 후 공개하며 수정하면 재심사해요. 일반 SNS는 별도로 즉시 게시하고 사진은 선택이에요. 혜택의 원문·사진은 피드 게시·작성자 목록·지역 집계에 포함하지 않으며 SNS 작성기에서 소식을 연결하거나 혜택 작성기를 열지 않아요. 쿠폰 모양 대신 제목 배지이며 클릭은 상세 안내로 이동해요. 쿠폰 발급·사용 기능은 없어요.
- 가게 소식 삭제·숨김은 혜택만 차단하고 기존 30일 원문·사진 파기 정책을 유지해요. 내부 사진 참조 행·암호화 저장·신고 스냅샷은 재사용하되 공개 닉네임이 없는 사진 소유 행을 피드 공개 프로필로 노출하지 않아요. 기존 원문·사진·FK는 삭제하거나 이관하지 않아요. `/api/promotions/public/{id}/reports`는 혜택의 로그인 신고이고 `/api/admin/promotions/{id}/visibility`로 숨김/복원을 처리해요. `NEWS` 좋아요는 승인된 혜택 ID, `POST`는 일반 피드 ID이며 내부 혜택 사진 행을 POST로 읽거나 NEWS로 변환하지 않아요. 통합 좋아요·관리자 신고 보관 기반은 재사용하고 댓글은 일반 피드에만 연결해요. 이번 분리 변경은 실행 백엔드에 연결하지 않았어요.
- 피드 원문은 게시 기한 없이 보관하고 삭제 즉시 공개에서 숨긴 뒤 30일 후 파기해요. 신고 스냅샷은 별도로 보존하며 일반 처리 완료 자료는 365일, OPEN/파기 보류 자료는 해당 상태 해제까지 보존해요. 처리·열람 감사는 각 기록일부터 최소 1년이며 `feed.retention.access-audit-years`는 1/2년만 허용하고 잘못된 값이면 파기를 중지해요. 연결된 신고 자료가 남아 있는 동안 감사도 보존해요. 사진 삭제는 기존 파일 삭제 outbox를 사용하고, 피드 API를 꺼도 이미 삭제한 자료의 파기와 탈퇴 정리는 계속해요. 실제 운영 파기·사진 왕복·보호 경계의 확인은 아직 실행 전이에요.

| 이름 | 용도 |
|---|---|
| `PORTONE_WEBHOOK_SECRET` | 포트원 웹훅 서명 검증 키. 설정 절차는 [결제 문서](payments.md) |
| `TOURISM_API_SERVICE_KEY` | 지역 대표 관광 사진 서버 조회 키. [지역 사진 자산](region-photo-assets.md) |
| `CHAT_IMAGE_ENCRYPTION_KEY` | 대화 사진 암호화용 32바이트 AES 키(표준 Base64). 생성·등록은 [채팅 사진](chat-images.md) |
| `CHAT_RETENTION_ENABLED` | 채팅·신고 증거·접근 기록 파기 스위치, 기본 `false`. [채팅 계약](chat-controls.md) |
| `CHAT_RETENTION_NOTICE_PUBLISHED_AT` | 실제 운영 고지 게시 시각(offset 포함 ISO-8601). 30일 유예 후 기존 자료에도 적용 |
| `CHAT_RETENTION_ACCESS_AUDIT_YEARS` | 관리자 접근 기록 보존 1년 또는 2년, 기본 `1` |
| `WAITING_RETENTION_ENABLED` | 종료된 직원 접수 자료 정리 스위치, 기본 `true`; 실제 고지 시각이 없으면 실행하지 않음 |
| `WAITING_RETENTION_NOTICE_PUBLISHED_AT` | 직원 접수 정책의 실제 운영 고지 게시 시각(offset 포함 ISO-8601) |

- **현재 후보는 운영 미적용이며 최종 검사가 남아 있어요.** 혜택 신청/심사는 관리자 `?tab=benefit-applications`, 댓글 신고는 피드 신고 관리의 댓글 항목에 있어요. 피드 위치 필터는 FeedRegionSheet가 공개 게시물 수를 조회하며 탐색과 RegionPickerSheet의 틀만 공유해요. 작성 지역 입력은 숨기고 기존 값은 편집 때 보존해요. 피드는 640px 열·16px 본문·가로 사진 열과 본인 글/댓글 메뉴를 사용하며 사진 확대는 가게 상세와 같은 뷰어예요. 기본 아이콘은 IconGlyphs/SvgIcon과 AntD 슬롯을 공유해요. 혜택과 피드는 작성·게시·사진 읽기·좋아요 대상을 분리하고 통합 좋아요 목록에서만 대상별 기록을 모아요.
- 댓글 사진·댓글 좋아요·댓글 알림을 추가한 10/14 후보의 표식은 `waiting-signup-hidden-feed-v6`였고, 10/16 전체 후보는 OAuth 정의를 더한 `waiting-signup-hidden-feed-oauth-v7`이에요. 알림 목록/개수/읽음은 수신 회원만 접근하고 삭제·숨김·제한된 원문은 제외해요. 90일 알림 파기와 탈퇴 정리는 기능 플래그와 별개로 유지해요. 댓글 신고 사진은 독립 증거와 관리자 열람 감사를 사용해요. 피드 DDL은 `manual-ddl.md` 15.6과 `scripts/sql/feed-comment-v6.sql`이며 당시 로컬 컬럼 3개/테이블 2개와 기존 자료 보존을 확인했어요. 최종 후보의 전체 검사·새 JAR 기동/validate·운영 적용은 남아 있고 이전 표식/검사로 대신하지 않아요.

### 혜택 디자인·자동 갱신 (2026-10-15 로컬 후보)

- `promotion.benefit_design`은 `STANDARD|PHOTO|COMPACT`를 저장하며 기존 행은 `STANDARD`예요. 작성기·목록·상세·검토는 같은 선택을 사용하고 디자인 변경은 재심사 대상이에요. 옛 요청에 디자인 값이 없으면 기존 값을 유지해요. 새 모델을 기동하기 전 [수동 DDL 15.7](manual-ddl.md#157-혜택-디자인자동-갱신-후보-2026-10-15-운영-미적용)의 컬럼을 준비해야 해요.
- 공개 변경 신호는 `GET /api/promotions/public/events`, 사업자·관리자 신호는 `GET /api/store-news/events`의 SSE이며 v1 별칭도 지원해요. 공개에는 공개 상태에 영향을 주는 변경만, 관리에는 관리자 또는 원문 작성자에게만 본문·식별값 없는 갱신 신호를 보내요. 실제 조회의 권한·사진 검사와 no-store는 유지해요. 전체·동일 회원/IP 연결 수를 제한하고 15초 heartbeat·2분 연결 만료를 사용해요. 현재 단일 인스턴스 내 신호이며 다중 인스턴스 전달은 포함하지 않아요.
- 설정 응답의 `benefitDesignEnabled`·`benefitEventsEnabled`가 있는 서버에서만 새 선택·SSE를 사용해요. 프론트는 연결 실패 시 60초 보조 재조회, 백그라운드/기능 이탈 시 연결 정리, 현재 목록 행 위치 보존을 사용해요. 관리자 원문 변경은 자동 표시하되 심사 사유를 유지하고 확인 버튼으로 새 버전을 확인하기 전 처리를 막아요. 사업자 작성 중인 편집값과 원본 revision은 고정해 충돌 검사를 유지해요.

### 책임 분리와 주소 설정 (2026-10-15 로컬 후보)

- `MyPage`는 내 정보 화면 조합을 담당해요. 이름·비밀번호·계정 사진·위치·사업자 인증·환경 설정은 `components/member/`에, 탈퇴의 계정/권한 세대·미결 처리 확인은 `useMemberWithdrawal`에 있어요.
- `StoreDetail`은 상세 화면 조합을 유지하고 실제 인원/시간/예약 UI는 `components/reservation/StoreReservationPanel`을 써요. 등록·수정 미리보기도 이 UI를 재사용해요. QR 시작/종료 약속은 `useQrCameraLifecycle`, 광고 작성 값/사진/전송 구성은 `advertisementForm`에 있어요.
- 서버 서비스의 공개 메서드와 트랜잭션 경계는 유지해요. `StoreDirectory`는 공개 검색/count/지역 집계·본인 가게/수정용 조회, `StoreImages`는 사진 순서·참조 검사·업로드·롤백/삭제 의도를 담당해요. 기존 FULLTEXT 탐지/비활성화 상태는 같은 StoreFulltextSearch 빈을 공유해요. `StoreStatistics`는 권한을 확인한 통계 조회, `ReservationAvailability`는 예약 가능 시간 계산, `ReservationAttendance`는 QR 발급·멱등 체크인·완료·노쇼 처리를 담당하며 나머지 예약 흐름도 `ReservationAccess`의 소유권/승인 정책을 공유해요. `PaymentPreparation`은 기존 예약금/결제 준비를 담당해요. 결제 확정·환불 원장·외부 호출·잠금 순서는 이 분리에서 바꾸지 않고 옮긴 로그도 기존 서비스의 logger 이름을 유지해요.
- 서버 `SiteUrls`와 프론트 `config/siteUrls.js`가 앱·홍보·기존 앱 출처를 관리해요. `APP_FRONTEND_URL`은 로그인/결제 복귀, `APP_PUBLIC_URL`은 공개 공유/sitemap, `APP_MARKETING_URL`은 홍보 주소, `APP_LEGACY_FRONTEND_URL`은 전환 중 기존 주소의 OAuth 복귀를 허용해요. 대응 프론트 값은 `VITE_APP_ORIGIN`, `VITE_MARKETING_ORIGIN`, `VITE_LEGACY_APP_ORIGIN`이에요. 미설정 상태는 기존 운영 주소를 유지해요.
- `marketing/`은 소개·기능·사업자 시작·FAQ·앱 진입의 정적 산출물이에요. `node marketing/build.mjs`는 별도 `marketing/dist/`에 앱과 공유하는 테마·글꼴·브랜드 자산과 robots/sitemap/release-id를 만들어요. 앱 API는 새 앱 호스트에서 같은 출처로 프록시하고 백엔드/DB/CDN은 유지해요.
- 가게 초안은 출처별 IndexedDB이므로 `/drafts/transfer`에서 사진 포함 파일로 이전해요. 메뉴 이름은 ‘가게 초안 옮기기’이며 앱과 기존 출처가 같은 현재 설정에서는 계정 메뉴에 표시하지 않아요. 같은 회원의 등록/수정 키만 복원하고 원래 30일 만료일·서버 원본 지문·사진 순서를 보존해요. 계정 세대, 사진 서명/크기/SHA-256, 값 구조를 확인하고 덮어쓰기는 직접 선택해요. 서버의 피드/소식 초안은 별도 이전하지 않아요.
- 배포 변수 `RESERVE_DOMAIN_SPLIT`은 기본 false이며 실제 전환 전에 [배포 런북](deployments.md)의 v6 복구·스키마·DNS/TLS·OAuth 등록 단계를 완료해야 해요. 소스와 선택형 배포 연결만 준비했고 실제 변수·DNS·콘솔·Nginx·운영 DB를 변경하지 않았어요.
