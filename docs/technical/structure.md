# 코드 구조

> 2026-07 갱신: 실제 폴더 구조를 전수 확인해서 누락된 도메인(community, promotion, file)과 프론트 구조(admin 탭, 공용 컴포넌트 전체, hooks 전체)를 채움. `password`는 별도 도메인이 아니라 `member` 소속으로 정정.

---

## 모노레포 루트

```
RESERVE/
├── backend/
├── frontend/
├── nginx/
│   └── default.conf              ← Nginx 설정 (SSL, upstream, SPA)
├── docs/
│   ├── guide/
│   │   ├── user-guide.md         ← 손님 가이드
│   │   └── owner-guide.md        ← 사장님 가이드
│   ├── rules/
│   │   ├── git-workflow.md       ← 브랜치 전략, 커밋 규칙, 릴리즈
│   │   └── code-conventions.md   ← 네이밍, 로그, PropTypes 컨벤션
│   └── technical/
│       ├── architecture.md       ← 인프라 구조 · 배포
│       ├── structure.md          ← 코드 구조 (이 문서)
│       └── design-system.md      ← 디자인 토큰 · 공통 컴포넌트
├── .github/workflows/
│   └── CICD.yml                  ← Blue/Green 자동 배포 (main push/PR에만 트리거)
├── docker-compose-blue.yml       ← Blue 컨테이너 (8080:8080)
├── docker-compose-green.yml      ← Green 컨테이너 (8081:8080)
└── README.md
```

---

## 백엔드 (`backend/src/main/java/com/reserve/`) — 실제 18개 도메인

```
com.reserve/
├── config/
│   ├── SecurityConfig.java        ← Spring Security, CORS, JWT 필터, permitAll 규칙
│   ├── WebMvcConfig.java          ← MVC 설정
│   ├── AsyncConfig.java           ← 비동기 설정
│   ├── controller/                ← AuthApiController (로그인/회원가입/토큰)
│   ├── jwt/                       ← TokenProvider, JwtAuthenticationFilter
│   ├── oauth2/                    ← OAuth2 핸들러, CustomOAuth2UserService
│   └── service/                   ← TokenService, RefreshTokenService
│
├── member/                        ← 회원 관리 (프로필, 탈퇴), PasswordResetController도 여기 소속
│                                     (별도 password 도메인 없음 — 과거 문서 오류 정정)
├── store/                         ← 가게 등록/수정/삭제/조회, AddressController
│   └── service/
│       ├── StoreRepository.java   ← findByIdForUpdate() 비관적 락(PESSIMISTIC_WRITE) — 예약 동시성 제어
│       └── FileStorageService는 file/ 도메인으로 이동됨 (아래 참고)
├── file/                          ← FileStorageService (S3 업로드/삭제) — store 소속 아닌 독립 도메인
├── reservation/                   ← 예약 생성/승인/취소/완료, 실시간 availability 조회
│   └── scheduler/                 ← 미결제 예약 자동 만료
├── payment/                       ← 포트원 V2 결제 준비/검증/환불
├── review/                        ← 리뷰 작성/수정/삭제
├── favorite/                      ← 즐겨찾기 토글/조회
├── business/                      ← 사업자 인증 신청/심사
├── inquiry/                       ← 1:1 문의 (회원/비회원 게스트 모두 가능, category enum, 관리자 답변)
├── mailbox/                       ← 관리자 메일 발송(Resend) — 보낸 메일함, 새 메일 작성만 지원 (인바운드 없음)
├── audit/                         ← 감사 로그 + 휴지통(예약/리뷰/발송메일 소프트 삭제·복구),
│                                     AdminManagementController(회원/가게 정지·차단)
├── email/                         ← 이메일 인증 코드 발송/검증
├── community/                     ← 게시판 — 프론트 미노출. Member/Store cascade 삭제 로직이 참조해서 존치
├── promotion/                     ← 가게 홍보 게시글(특색메뉴/스토리) — 식당 시절 유물, 프론트 미노출, community와
│                                     동일한 이유로 존치. **광고(유료 노출) 기능과는 다른 개념이니 혼동 주의**
├── common/
│   └── HealthCheckController.java
└── global/
    ├── common/                    ← ApiResponse 공통 포맷
    ├── error/                     ← GlobalExceptionHandler, 도메인별 Exception
    └── ratelimit/                 ← Bucket4j IP rate limiting
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
├── api/
│   └── axios.js              ← Axios 인스턴스 (JWT 쿠키, refresh 재시도, SessionExpiredError)
│
├── components/
│   ├── common/                ← 아래 "공용 컴포넌트 전체 목록" 참고
│   ├── admin/                 ← MembersTab, StoresAdminTab, ReservationsAllTab, DashboardTab,
│   │                             AuditLogTab, TrashTab, MailboxTab (AdminPanel이 탭별로 위임)
│   ├── layout/
│   │   └── Header.jsx, Footer.jsx
│   ├── reservation/
│   │   └── ReservationStatusBadge.jsx
│   ├── review/
│   │   └── ReviewList.jsx
│   └── store/
│       ├── StoreCard.jsx
│       └── StoreForm/         ← 가게 등록/수정 폼, AddressSearch(useReducer)
│
├── constants/
│   ├── api.js                 ← API_ENDPOINTS, BASE_URL
│   ├── categories.js          ← STORE_CATEGORIES 등
│   ├── roles.js                ← USER_ROLES, hasOwnerAccess()
│   ├── status.js               ← RESERVATION_STATUS 레이블/색상
│   └── index.js
│
├── hooks/
│   ├── queryKeys.js            ← TanStack Query 쿼리 키 팩토리 (신규 쿼리 추가 시 여기부터)
│   ├── useDebounce.js
│   ├── useDocumentTitle.js
│   ├── useEmailVerification.js
│   ├── useFormReady.js
│   ├── useImagePreview.jsx
│   ├── useManageReservations.js  ← 사업자 예약 관리 (query + 승인/거절/완료/노쇼 mutation)
│   ├── useMessage.js              ← Ant Design 메시지/모달 래퍼
│   ├── useMyStores.js             ← query + mutation (optimistic update)
│   ├── usePayment.js              ← 포트원 결제 플로우
│   ├── useReservations.js
│   ├── useStoreData.js
│   ├── useStoreDetailActions.js
│   ├── useStoreForm.js
│   ├── useStoreList.js            ← 공개 가게 목록, 5분 캐시
│   ├── useWindowWidth.js
│   └── index.js
│
├── pages/
│   ├── admin/                  ← AdminPanel.jsx (탭 구현은 components/admin/에 위치)
│   ├── auth/                   ← Login, Signup, OAuthCallback, ForgotPassword, SocialAgreement
│   ├── business/                ← BusinessPanel (예약 관리)
│   ├── favorite/                ← 즐겨찾기
│   ├── Home/                    ← 랜딩 페이지 (hooks/, sections/ 하위 폴더)
│   ├── legal/                   ← Terms, Privacy
│   ├── member/                  ← 마이페이지
│   ├── payment/                  ← 결제 결과
│   ├── reservation/              ← 내 예약
│   └── store/                    ← 가게 목록/상세/등록/수정
│
├── services/                    ← API 호출 레이어 (도메인별): businessService, favoriteService,
│                                   memberService, paymentService, reservationService,
│                                   reviewService, storeService
├── store/
│   └── useAuthStore.js         ← Zustand (로그인 상태, user 정보) — 401/403/세션만료 때만 로그아웃
├── styles/
│   ├── theme.js                 ← 디자인 시스템 참고용 (App.jsx의 인라인 themeConfig와 별개, 미적용 상태)
│   └── tokens/                  ← colors, typography, radius, shadows, animations(scaleSpringIn 등)
├── utils/
│   ├── image.js                ← getImageUrl (CloudFront URL 처리)
│   ├── form.js                  ← buildStoreFormData
│   ├── errorHandler.js          ← handleApiError
│   └── index.js
│
├── App.jsx                     ← 라우터 + ConfigProvider(themeConfig) + AntApp
└── main.jsx
```

### 공용 컴포넌트 전체 목록 (`components/common/`)

`Avatar, Badge, Button, Card, CustomPagination, FavoriteButton, FilterToolbar, FormDatePicker, FormInput, FormModal(+FormField), FormSelect, FormTextArea, FormTimePicker, InquiryModal, KakaoMap, Loading, PageContainer, Skeletons(Bone 외 7종), index.js`

이 17개 컴포넌트는 `docs/rules/code-conventions.md` 기준으로 **PropTypes 필수** 대상. 자세한 사용법은 `design-system.md` 참고.

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
| `/business` | 사업자 패널 | BUSINESS / ADMIN |
| `/admin` | 관리자 패널 | ADMIN |
| `/payment/result` | 결제 결과 | 로그인 |

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
          google:
            client-id: YOUR_GOOGLE_CLIENT_ID
            client-secret: YOUR_GOOGLE_CLIENT_SECRET
          naver:
            client-id: YOUR_NAVER_CLIENT_ID
            client-secret: YOUR_NAVER_CLIENT_SECRET
          kakao:
            client-id: YOUR_KAKAO_CLIENT_ID
            client-secret: YOUR_KAKAO_CLIENT_SECRET

jwt:
  secret-key: YOUR_JWT_SECRET

mail:
  username: resend
  password: YOUR_RESEND_API_KEY

portone:
  imp-key: YOUR_IMP_KEY
  imp-secret: YOUR_IMP_SECRET
  imp-code: YOUR_IMP_CODE
  v2-secret: YOUR_V2_SECRET
  store-id: YOUR_STORE_ID

S3_BUCKET_NAME: YOUR_S3_BUCKET
CLOUDFRONT_DOMAIN: YOUR_CLOUDFRONT_DOMAIN
AWS_REGION: ap-northeast-2
AWS_ACCESS_KEY_ID: YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY: YOUR_SECRET_KEY
```
