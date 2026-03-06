# 프로젝트 구조

## 모노레포 루트

```
RESERVE/
├── backend/                # Spring Boot 3.5.6 (Java 21)
├── frontend/               # React 19 + Vite 7
├── docs/                   # 프로젝트 문서
│   ├── deployment.md       # 배포 가이드 (EC2/Docker/Nginx/Secrets)
│   ├── design-system.md    # 프론트엔드 디자인 토큰 & 컴포넌트
│   └── structure.md        # 이 파일
├── .github/workflows/
│   └── CICD.yml            # GitHub Actions Blue/Green 배포
└── README.md
```

---

## 백엔드 구조 (`backend/src/main/java/com/reserve/`)

```
com.reserve/
├── config/           # SecurityConfig, WebMvcConfig, SwaggerConfig 등
├── auth/             # JWT 필터, OAuth2 핸들러, 토큰 서비스
├── member/           # 회원 도메인 (Entity, Repository, Service, Controller)
├── store/            # 가게 도메인
├── reservation/      # 예약 도메인
├── payment/          # 결제 도메인 (포트원 V1/V2)
├── review/           # 리뷰 도메인
├── favorite/         # 즐겨찾기 도메인
├── admin/            # 관리자 기능
├── business/         # 사업자 인증 신청
└── common/           # 공통 응답 DTO, 예외 처리
```

---

## 프론트엔드 구조 (`frontend/src/`)

```
src/
├── api/
│   └── axios.js              # Axios 인스턴스 + 인터셉터
│
├── components/
│   ├── common/               # 공통 UI (Button, Input, Card, Skeleton 등)
│   ├── layout/               # Header
│   ├── reservation/          # ReservationCard, ReservationStatusBadge
│   ├── review/               # ReviewList
│   └── store/                # StoreCard, StoreForm
│
├── constants/
│   ├── api.js                # API_ENDPOINTS, BASE_URL
│   ├── categories.js         # STORE_CATEGORIES
│   ├── status.js             # RESERVATION_STATUS, LABELS, COLORS
│   └── roles.js              # USER_ROLES, hasOwnerAccess()
│
├── hooks/
│   ├── useMessage.js         # Ant Design App.useApp() 래퍼
│   ├── useStoreData.js       # 가게 상세 fetch
│   ├── useStoreList.js       # 가게 목록 검색/정렬
│   ├── useMyStores.js        # 내 가게 목록 + 삭제
│   ├── useReservations.js    # 내 예약 목록 + 취소
│   ├── useManageReservations.js  # 사업자용 예약 관리
│   └── usePayment.js         # 포트원 결제 플로우
│
├── pages/
│   ├── Home/                 # 랜딩 페이지 (섹션 분리)
│   ├── auth/                 # Login, Signup, OAuthCallback
│   ├── store/                # StoreList, StoreDetail, StoreRegister, StoreEdit, MyStores
│   ├── reservation/          # MyReservations
│   ├── favorite/             # MyFavorites
│   ├── member/               # MyPage (프로필, 비밀번호, 탈퇴)
│   ├── business/             # BusinessPanel (예약 관리, 통계)
│   ├── admin/                # AdminPanel (인증 심사, 전체 예약)
│   └── payment/              # PaymentResult (포트원 콜백)
│
├── services/                 # API 서비스 레이어
│   ├── storeService.js
│   ├── reservationService.js
│   ├── paymentService.js
│   ├── reviewService.js
│   ├── favoriteService.js
│   ├── memberService.js
│   └── adminService.js
│
├── store/
│   └── useAuthStore.js       # Zustand — 인증 상태
│
├── styles/
│   ├── theme.js              # Ant Design ConfigProvider 테마
│   └── tokens/               # 디자인 토큰 (colors, typography, spacing)
│
└── utils/
    ├── image.js              # getThumbnailUrl, getDetailImageUrl
    ├── date.js               # formatDate, formatTime, formatTimeForApi
    ├── validation.js         # VALIDATION_RULES (Ant Design Form rules)
    └── common.js             # formatCurrency, debounce
```

---

## 주요 라우트

| 경로 | 페이지 | 권한 |
|---|---|---|
| `/` | 홈 (랜딩) | 공개 |
| `/stores` | 가게 목록 | 공개 |
| `/store/:id` | 가게 상세 + 예약 + 리뷰 | 공개 |
| `/login` `/signup` | 인증 | 비로그인 |
| `/my-reservations` | 내 예약 | 로그인 |
| `/my-favorites` | 즐겨찾기 | 로그인 |
| `/my-page` | 마이페이지 | 로그인 |
| `/my-stores` | 내 가게 관리 | OWNER/ADMIN |
| `/store/register` | 가게 등록 | OWNER/ADMIN |
| `/store/:id/edit` | 가게 수정 | OWNER/ADMIN |
| `/business` | 사업자 패널 | OWNER/ADMIN |
| `/admin` | 관리자 패널 | ADMIN |
| `/payment/result` | 결제 결과 | 로그인 |
