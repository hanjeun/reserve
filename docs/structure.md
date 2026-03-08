# 프로젝트 구조

---

## 모노레포 루트

```
RESERVE/
├── backend/
├── frontend/
├── nginx/
│   └── default.conf              ← EC2 nginxserver 설정
├── docs/
│   ├── deployment.md
│   ├── design-system.md
│   └── structure.md
├── .github/workflows/
│   └── CICD.yml                  ← Blue/Green 자동 배포
├── docker-compose-blue.yml
├── docker-compose-green.yml
└── README.md
```

---

## 백엔드 (`backend/src/main/java/com/reserve/`)

```
com.reserve/
├── config/
│   ├── SecurityConfig.java
│   ├── WebMvcConfig.java
│   ├── AsyncConfig.java
│   ├── RestTemplateConfig.java
│   ├── controller/              # AuthApiController (로그인/회원가입/토큰 재발급)
│   ├── dto/
│   ├── jwt/                     # TokenProvider, JwtAuthenticationFilter, RefreshToken
│   ├── oauth2/                  # OAuth2 핸들러, CustomOAuth2UserService
│   ├── service/                 # TokenService, RefreshTokenService
│   └── util/                    # CookieUtil, SecurityUtil
│
├── member/                      # 회원 관리 (프로필 조회/수정, 탈퇴)
├── store/                       # 가게 등록/수정/삭제/조회, 파일 업로드
├── reservation/                 # 예약 생성/승인/취소/완료, 만료 스케줄러
├── payment/                     # 포트원 V2 결제 준비/검증/환불
├── review/                      # 리뷰 작성/수정/삭제
├── favorite/                    # 즐겨찾기 토글/조회
├── business/                    # 사업자 인증 신청/심사
├── email/                       # 이메일 인증 코드 발송/검증
├── community/                   # 커뮤니티 게시판 (미완성)
├── notice/                      # 공지사항 (미완성)
├── inquiry/                     # 문의 (미완성)
├── promotion/                   # 프로모션 (미완성)
├── common/
│   └── HealthCheckController.java
└── global/
    ├── common/                  # ApiResponse 공통 포맷
    ├── error/                   # GlobalExceptionHandler, 도메인별 Exception
    └── ratelimit/               # Bucket4j 기반 IP rate limiting
```

### 설정 파일 (`backend/src/main/resources/`)

```
application.yml          # 프로파일 지정 (기본: local)
application-common.yml   # 전 환경 공통 (JPA, Mail, JWT 만료시간 등)
application-local.yml    # 로컬 개발 (localhost MySQL, redirect URI)
application-prod.yml     # 운영 (Docker MySQL, 배포 도메인 redirect URI)
application-blue.yml     # Blue 컨테이너 포트 (8080)
application-green.yml    # Green 컨테이너 포트 (8081)
application-secret.yml   # 민감 정보 — gitignore됨, 로컬에서 직접 생성
```

---

## 프론트엔드 (`frontend/src/`)

```
src/
├── api/
│   └── axios.js              # Axios 인스턴스 (쿠키 JWT 인터셉터, refresh 재시도)
│
├── components/
│   ├── common/               # 재사용 UI 컴포넌트 (Button, Card, Form*, PageContainer 등)
│   ├── layout/
│   │   └── Header.jsx
│   ├── reservation/
│   │   └── ReservationStatusBadge.jsx
│   ├── review/
│   │   └── ReviewList.jsx
│   └── store/
│       ├── StoreCard.jsx
│       └── StoreForm/        # 가게 등록/수정 폼 (BasicInfo, Images, Actions)
│
├── constants/
│   ├── api.js                # API_ENDPOINTS, BASE_URL
│   ├── categories.js         # STORE_CATEGORIES, RESERVATION_SLOT_OPTIONS 등
│   ├── roles.js              # USER_ROLES, hasOwnerAccess()
│   ├── status.js             # RESERVATION_STATUS 레이블/컬러 맵
│   └── index.js
│
├── hooks/
│   ├── useManageReservations.js  # 사업자 예약 관리 (승인/거절/완료/노쇼)
│   ├── useMessage.js             # Ant Design App.useApp() 래퍼
│   ├── useMyStores.js
│   ├── usePayment.js             # 포트원 결제 플로우 (prepare → IMP → verify)
│   ├── useReservations.js
│   ├── useStoreData.js
│   ├── useStoreForm.js
│   ├── useStoreList.js
│   └── index.js
│
├── pages/
│   ├── admin/                # AdminPanel (사업자 인증 심사, 전체 예약 조회)
│   ├── auth/                 # Login, Signup, OAuthCallback
│   ├── business/             # BusinessPanel (예약 관리)
│   ├── favorite/             # MyFavorites
│   ├── Home/                 # 랜딩 (섹션 분리)
│   ├── member/               # MyPage
│   ├── payment/              # PaymentResult
│   ├── reservation/          # MyReservations
│   └── store/                # StoreList, StoreDetail, StoreRegister, StoreEdit, MyStores
│
├── services/                 # API 호출 레이어 (도메인별 분리)
├── store/
│   └── useAuthStore.js       # Zustand — 로그인 상태, user 정보
├── styles/
│   ├── theme.js              # Ant Design ConfigProvider 테마
│   └── tokens/               # colors, typography, spacing, radius, shadows
├── utils/
│   ├── common.js
│   ├── date.js
│   ├── image.js              # getThumbnailUrl
│   ├── validation.js         # VALIDATION_RULES (Ant Design Form 규칙)
│   └── index.js
│
├── App.jsx                   # 라우터 + ConfigProvider + AntApp
└── main.jsx
```

---

## 환경변수

### 프론트엔드 (`frontend/.env.local`)

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_PORTONE_CHANNEL_KEY=your_channel_key
VITE_SKELETON_DELAY=0
```

### 백엔드 (`backend/src/main/resources/application-secret.yml`)

로컬에서 직접 생성. 운영 환경에서는 GitHub Secrets → Docker Compose 환경변수로 자동 주입됩니다.

---

## 라우트

| 경로 | 페이지 | 권한 |
|---|---|---|
| `/` | 홈 | 공개 |
| `/stores` | 가게 목록 | 공개 |
| `/store/:id` | 가게 상세 · 예약 · 리뷰 | 공개 |
| `/login` `/signup` | 인증 | 비로그인 |
| `/my-reservations` | 내 예약 | 로그인 |
| `/my-favorites` | 즐겨찾기 | 로그인 |
| `/my-page` | 마이페이지 | 로그인 |
| `/my-stores` | 내 가게 관리 | BUSINESS / ADMIN |
| `/store/register` | 가게 등록 | BUSINESS / ADMIN |
| `/store/:id/edit` | 가게 수정 | BUSINESS / ADMIN |
| `/business` | 사업자 패널 | BUSINESS / ADMIN |
| `/admin` | 관리자 패널 | ADMIN |
| `/payment/result` | 결제 결과 | 로그인 |
