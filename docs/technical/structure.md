# 코드 구조

---

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
│       ├── structure.md          ← 코드 구조 (이 문서)
│       └── design-system.md      ← 디자인 토큰 · 공통 컴포넌트
├── .github/
│   ├── workflows/CICD.yml        ← Blue/Green 자동 배포 (main push/PR에만 트리거)
│   ├── ISSUE_TEMPLATE/           ← 버그/기능 이슈 폼
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml            ← 의존성 자동 업데이트 (npm · gradle · actions)
├── docker-compose-blue.yml       ← Blue 컨테이너 (8080:8080)
├── docker-compose-green.yml      ← Green 컨테이너 (8081:8080)
├── THIRD_PARTY_NOTICES.md        ← 서드파티 라이선스 고지
└── README.md
```

---

## 백엔드 (`backend/src/main/java/kr/it/reserve/`) — 20개 패키지

진입점은 `kr/it/reserve/ReserveApplication.java`.

```
kr.it.reserve/
├── config/
│   ├── SecurityConfig.java        ← Spring Security, CORS, JWT 필터, permitAll 규칙
│   ├── WebMvcConfig.java          ← MVC 설정
│   ├── AsyncConfig.java           ← 비동기 스레드풀 (이미지 병렬 업로드 등)
│   ├── controller/                ← AuthApiController (로그인/회원가입/토큰)
│   ├── jwt/                       ← TokenProvider, JwtAuthenticationFilter
│   │   └── scheduler/             ← RefreshTokenCleanupScheduler (만료 refresh 토큰 정리)
│   ├── oauth2/                    ← OAuth2 핸들러, CustomOAuth2UserService
│   └── service/                   ← TokenService, RefreshTokenService
│
├── member/                        ← 회원 관리 (프로필, 위치, 탈퇴), PasswordResetController 포함
├── store/                         ← 가게 등록/수정/삭제/조회, AddressController(주소검색 프록시)
│   └── service/StoreRepository    ← findByIdForUpdate() 비관적 락(PESSIMISTIC_WRITE) — 예약 동시성 제어
├── file/                          ← FileStorageService (S3 업로드/삭제) — 독립 도메인
├── reservation/                   ← 예약 생성/승인/취소/완료/수정(PATCH), 실시간 availability
│   ├── scheduler/                 ← 미결제 예약 자동 만료
│   ├── util/                      ← ReservationCodeGenerator(R-날짜-XXXX), QrCheckinTokenProvider(HMAC)
│   └── ReservationCodeBackfillRunner  ← 기존 예약에 코드 백필 (앱 기동 시 1회)
├── payment/                       ← 포트원 V2 결제 준비/검증/환불 (PortoneService)
├── advertisement/                 ← 유료 광고 (배지형/배너형), 포트원 결제 재사용        ★신규
│   ├── scheduler/                 ← AdvertisementExpiryScheduler(만료), AdCounterFlushScheduler
│   └── service/AdCounterBuffer    ← 노출/클릭 카운터 인메모리 버퍼링 후 주기적 flush
├── review/                        ← 리뷰 작성/수정/삭제
├── favorite/                      ← 즐겨찾기 토글/조회
├── business/                      ← 사업자 인증 신청/심사
├── inquiry/                       ← 1:1 문의 (회원/비회원 게스트, category enum, 관리자 답변)
├── mailbox/                       ← 관리자 메일 발송(Resend) — 보낸 메일함 (인바운드 없음)
├── notice/                        ← 공지사항 등록/조회                                   ★신규
├── audit/                         ← 감사 로그 + 휴지통(소프트 삭제·복구),
│                                     AdminManagementController(회원/가게 정지·차단),
│                                     TrashCleanupScheduler
├── email/                         ← 이메일 인증 코드 발송/검증
├── community/                     ← 게시판 — 프론트 미노출. Member/Store cascade 삭제가 참조해 존치
├── promotion/                     ← 가게 홍보 게시글 — 식당 시절 유물, 미노출.
│                                     **광고(advertisement, 유료 노출)와는 다른 개념이니 혼동 주의**
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
application-secret.yml   ← 민감 정보 (gitignore, 로컬에서 직접 생성)
```

---

## 프론트엔드 (`frontend/src/`)

```
src/
├── api/axios.js              ← Axios 인스턴스 (JWT, refresh 재시도, SessionExpiredError)
│
├── components/
│   ├── common/               ← 아래 "공용 컴포넌트 전체 목록" 참고
│   ├── admin/                ← MembersTab, StoresAdminTab, ReservationsAllTab, DashboardTab,
│   │                            AuditLogTab, TrashTab, MailboxTab, AdminAdsTab,
│   │                            BusinessVerificationTab, SanctionModal (AdminPanel이 탭 위임)
│   ├── business/             ← 사장님 패널 탭 (예약 관리, 통계)                     ★신규
│   ├── advertisement/        ← AdBanner(배너 노출), AdManageTab(광고 등록/결제)      ★신규
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
│   ├── useImagePreview.jsx   ← Image.PreviewGroup 기반 미리보기 (닫힘 애니·멀티)
│   ├── useExitAnimation.js   ← 닫힘 트랜지션 공통 훅                                ★신규
│   ├── useQueryParamState.js ← 관리자 탭 URL 쿼리스트링 동기화                       ★신규
│   ├── useStoreImageHint.js  ← 상세 스켈레톤용 이미지 비율 힌트                       ★신규
│   ├── useOnlineStatus.js    ← 온라인/오프라인 감지 (useSyncExternalStore)           ★신규
│   ├── useAdPayment.js       ← 광고 결제 플로우                                       ★신규
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
│                               reviewService, storeService                          (adService ★신규)
├── store/
│   ├── useAuthStore.js       ← Zustand (로그인 상태) — 401/403/세션만료 때만 로그아웃
│   └── useLocationStore.js   ← 세션 한정 라이브 위치 (우리동네 배지용)                 ★신규
├── styles/
│   └── tokens/               ← colors, typography, radius, shadows, animations, chart(★신규)
│                               (구 theme.js는 제거됨 — App.jsx 인라인 themeConfig 사용)
├── utils/                   ← image, form, errorHandler, validation, distance(★),
│                               adAttribution(★), imageHintCache(★), paymentWindowGuard(★),
│                               redirect(★), index
├── App.jsx                  ← 라우터(라우트 lazy 코드분할) + ConfigProvider + AntApp
└── main.jsx
```

### 공용 컴포넌트 전체 목록 (`components/common/`)

`Avatar, Badge, Button, Card, ChartCard, DataTable, FavoriteButton, FilterToolbar, FormDatePicker, FormInput, FormModal(+FormField), FormSelect, FormTextArea, FormTimePicker, InquiryModal, KakaoMap, Loading(+ArcSpinner/SpinIndicator), ModalLoading, PageContainer, PieLegend, SegmentedControl, Skeletons(Bone 외), StatCard, index.js`

공유 컴포넌트는 `docs/rules/code-conventions.md` 기준 **PropTypes 필수** 대상. 사용법은 `design-system.md` 참고.

---

## 라우트

| 경로 | 페이지 | 권한 |
|---|---|---|
| `/` | 홈 | 공개 |
| `/stores` | 가게 목록 | 공개 |
| `/store/:id` | 가게 상세 · 예약 · 리뷰 | 공개 |
| `/login` `/signup` | 인증 | 비로그인 |
| `/forgot-password` | 비밀번호 재설정 | 비로그인 |
| `/oauth2/callback` | 소셜 로그인 콜백 | 비로그인 |
| `/signup/social` | 소셜 회원가입 추가 동의 | 비로그인 |
| `/terms` `/privacy` | 약관/개인정보 | 공개 |
| `/my-reservations` | 내 예약 | 로그인 |
| `/my-favorites` | 즐겨찾기 | 로그인 |
| `/my-page` | 마이페이지 | 로그인 |
| `/my-stores` | 내 가게 관리 | BUSINESS / ADMIN |
| `/store/register` | 가게 등록 | BUSINESS / ADMIN |
| `/store/:id/edit` | 가게 수정 | BUSINESS / ADMIN |
| `/business` | 사업자 패널 (예약 · 통계 · 광고) | BUSINESS / ADMIN |
| `/admin` | 관리자 패널 | ADMIN |
| `/payment/result` | 결제 결과 (예약/광고) | 로그인 |

---

## 환경변수

### 프론트엔드 (`frontend/.env.local`)

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_PORTONE_CHANNEL_KEY=your_channel_key
VITE_SKELETON_DELAY=0
```

### 백엔드 (`backend/src/main/resources/application-secret.yml`)

로컬에서 직접 생성. 운영 환경에서는 GitHub Secrets → Docker Compose 환경변수로 자동 주입.

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

mail:
  username: resend
  password: YOUR_RESEND_API_KEY

portone:
  imp-key: ...
  imp-secret: ...
  imp-code: ...
  v2-secret: ...
  store-id: ...

S3_BUCKET_NAME: YOUR_S3_BUCKET
CLOUDFRONT_DOMAIN: YOUR_CLOUDFRONT_DOMAIN
AWS_REGION: ap-northeast-2
AWS_ACCESS_KEY_ID: YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY: YOUR_SECRET_KEY
```
