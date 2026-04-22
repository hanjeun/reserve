# 코드 구조

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
│   └── technical/
│       ├── architecture.md       ← 인프라 구조 · 배포
│       ├── structure.md          ← 코드 구조 (이 문서)
│       └── design-system.md     ← 디자인 토큰 · 공통 컴포넌트
├── .github/workflows/
│   └── CICD.yml                  ← Blue/Green 자동 배포
├── docker-compose-blue.yml       ← Blue 컨테이너 (8080:8080)
├── docker-compose-green.yml      ← Green 컨테이너 (8081:8080)
└── README.md
```

---

## 백엔드 (`backend/src/main/java/com/reserve/`)

```
com.reserve/
├── config/
│   ├── SecurityConfig.java        ← Spring Security, CORS, JWT 필터
│   ├── WebMvcConfig.java          ← MVC 설정
│   ├── AsyncConfig.java           ← 비동기 설정
│   ├── controller/                ← AuthApiController (로그인/회원가입/토큰)
│   ├── jwt/                       ← TokenProvider, JwtAuthenticationFilter
│   ├── oauth2/                    ← OAuth2 핸들러, CustomOAuth2UserService
│   └── service/                   ← TokenService, RefreshTokenService
│
├── member/                        ← 회원 관리 (프로필, 비밀번호, 탈퇴)
├── store/                         ← 가게 등록/수정/삭제/조회
│   └── service/
│       └── FileStorageService.java ← S3 업로드/삭제
├── reservation/                   ← 예약 생성/승인/취소/완료
│   └── scheduler/                 ← 미결제 예약 자동 만료
├── payment/                       ← 포트원 V2 결제 준비/검증/환불
├── review/                        ← 리뷰 작성/수정/삭제
├── favorite/                      ← 즐겨찾기 토글/조회
├── business/                      ← 사업자 인증 신청/심사
├── email/                         ← 이메일 인증 코드 발송/검증
├── password/                      ← 비밀번호 재설정
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
│   └── axios.js              ← Axios 인스턴스 (JWT 쿠키, refresh 재시도)
│
├── components/
│   ├── common/               ← Button, Card, FormInput, PageContainer 등
│   ├── layout/
│   │   └── Header.jsx
│   ├── reservation/
│   │   └── ReservationStatusBadge.jsx
│   ├── review/
│   │   └── ReviewList.jsx
│   └── store/
│       ├── StoreCard.jsx
│       └── StoreForm/        ← 가게 등록/수정 폼
│
├── constants/
│   ├── api.js                ← API_ENDPOINTS, BASE_URL
│   ├── categories.js         ← STORE_CATEGORIES 등
│   ├── roles.js              ← USER_ROLES, hasOwnerAccess()
│   ├── status.js             ← RESERVATION_STATUS 레이블/색상
│   └── index.js
│
├── hooks/
│   ├── useManageReservations.js  ← 사업자 예약 관리
│   ├── useMessage.js             ← Ant Design 메시지/모달 래퍼
│   ├── useMyStores.js
│   ├── usePayment.js             ← 포트원 결제 플로우
│   ├── useReservations.js
│   ├── useStoreData.js
│   ├── useStoreForm.js
│   ├── useStoreList.js
│   └── index.js
│
├── pages/
│   ├── admin/                ← 관리자 패널 (사업자 심사, 전체 예약)
│   ├── auth/                 ← Login, Signup, OAuthCallback, ForgotPassword
│   ├── business/             ← 사업자 패널 (예약 관리)
│   ├── favorite/             ← 즐겨찾기
│   ├── Home/                 ← 랜딩 페이지
│   ├── member/               ← 마이페이지
│   ├── payment/              ← 결제 결과
│   ├── reservation/          ← 내 예약
│   └── store/                ← 가게 목록/상세/등록/수정
│
├── services/                 ← API 호출 레이어 (도메인별)
├── store/
│   └── useAuthStore.js       ← Zustand (로그인 상태, user 정보)
├── styles/
│   ├── theme.js              ← Ant Design ConfigProvider 테마
│   └── tokens/               ← colors, typography, radius, shadows
├── utils/
│   ├── image.js              ← getImageUrl (CloudFront URL 처리)
│   ├── form.js               ← buildStoreFormData
│   ├── errorHandler.js       ← handleApiError
│   └── index.js
│
├── App.jsx                   ← 라우터 + ConfigProvider + AntApp
└── main.jsx
```

---

## 라우트

| 경로 | 페이지 | 권한 |
|---|---|---|
| `/` | 홈 | 공개 |
| `/stores` | 가게 목록 | 공개 |
| `/store/:id` | 가게 상세 · 예약 · 리뷰 | 공개 |
| `/login` `/signup` | 인증 | 비로그인 |
| `/forgot-password` | 비밀번호 재설정 | 비로그인 |
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
