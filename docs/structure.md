# 프로젝트 구조

---

## 모노레포 루트

```
RESERVE/
├── backend/                  # Spring Boot 3.5.6 / Java 21
├── frontend/                 # React 19 / Vite 7
├── nginx/                    # Nginx 설정 (EC2 배포용)
│   └── default.conf
├── docs/                     # 프로젝트 문서
│   ├── deployment.md         # 배포 · 인프라 · 트러블슈팅
│   ├── design-system.md      # 디자인 토큰 & 컴포넌트 가이드
│   └── structure.md          # 이 파일
├── .github/workflows/
│   └── CICD.yml              # Blue/Green 자동 배포
├── docker-compose-blue.yml
├── docker-compose-green.yml
└── README.md
```

---

## 백엔드 (`backend/src/main/java/com/reserve/`)

```
com.reserve/
├── auth/                     # OAuth2 + JWT 인증
│   ├── controller/
│   ├── dto/
│   ├── filter/               # JwtAuthenticationFilter
│   ├── handler/              # OAuth2 성공/실패 핸들러
│   └── service/
├── member/                   # 회원 관리
├── store/                    # 가게 등록/수정/조회
├── reservation/              # 예약 생성/승인/취소
├── payment/                  # 포트원 V2 결제
├── favorite/                 # 즐겨찾기
├── review/                   # 리뷰 작성/수정/삭제
├── admin/                    # 관리자 기능
├── business/                 # 사업자 인증
├── community/                # 커뮤니티 게시판
├── promotion/                # 프로모션
├── notice/                   # 공지사항
├── inquiry/                  # 문의
├── email/                    # 이메일 인증
└── global/
    ├── config/               # SecurityConfig, WebMvcConfig, CorsConfig
    ├── error/                # BusinessException 계층, GlobalExceptionHandler
    └── response/             # ApiResponse 공통 포맷
```

### 백엔드 설정 파일 (`backend/src/main/resources/`)

```
application.yml               # 공통 프로파일 지정
application-common.yml        # 공통 설정 (JPA, Mail 등)
application-local.yml         # 로컬 개발 환경
application-prod.yml          # 운영 환경 (DB, OAuth, 포트원)
application-blue.yml          # Blue 컨테이너 포트 설정
application-green.yml         # Green 컨테이너 포트 설정
application-secret.yml        # 민감 정보 (gitignore됨)
```

---

## 프론트엔드 (`frontend/src/`)

```
src/
├── api/
│   └── axios.js              # Axios 인스턴스 (JWT 인터셉터 포함)
│
├── components/
│   ├── common/               # 재사용 UI 컴포넌트
│   │   ├── Button.jsx        # variant: primary/secondary/hero/ghost/danger/link/ghost-sm-*
│   │   ├── Card.jsx          # Card + Card.Cover + Card.Add
│   │   ├── FavoriteButton.jsx
│   │   ├── FormDatePicker.jsx
│   │   ├── FormInput.jsx     # + FormInput.WithButton
│   │   ├── FormSelect.jsx
│   │   ├── FormTextArea.jsx
│   │   ├── FormTimePicker.jsx # + RangePicker
│   │   ├── Loading.jsx
│   │   ├── PageContainer.jsx # size: sm/md/lg/xl
│   │   ├── Skeletons.jsx
│   │   └── index.js
│   ├── layout/
│   │   └── Header.jsx
│   ├── reservation/
│   │   └── ReservationStatusBadge.jsx
│   ├── review/
│   │   └── ReviewList.jsx
│   └── store/
│       ├── StoreCard.jsx
│       └── StoreForm.jsx
│
├── constants/
│   ├── api.js                # API_ENDPOINTS, BASE_URL
│   ├── categories.js         # STORE_CATEGORIES
│   ├── roles.js              # USER_ROLES, hasOwnerAccess()
│   ├── status.js             # RESERVATION_STATUS, LABELS, COLORS
│   └── index.js
│
├── hooks/
│   ├── useManageReservations.js  # 사업자 예약 관리
│   ├── useMessage.js             # AntD App.useApp() 래퍼
│   ├── useMyStores.js
│   ├── usePayment.js             # 포트원 결제 플로우
│   ├── useReservations.js
│   ├── useStoreData.js
│   ├── useStoreList.js
│   └── index.js
│
├── pages/
│   ├── admin/AdminPanel.jsx
│   ├── auth/                 # Login, Signup, OAuthCallback
│   ├── business/BusinessPanel.jsx
│   ├── favorite/MyFavorites.jsx
│   ├── Home/                 # 랜딩 (섹션 분리)
│   ├── member/MyPage.jsx
│   ├── payment/PaymentResult.jsx
│   ├── reservation/MyReservations.jsx
│   └── store/                # StoreList, StoreDetail, StoreRegister, StoreEdit, MyStores
│
├── services/                 # API 호출 레이어
│   ├── authService.js
│   ├── favoriteService.js
│   ├── memberService.js
│   ├── paymentService.js
│   ├── reservationService.js
│   ├── reviewService.js
│   ├── storeService.js
│   └── index.js
│
├── store/
│   └── useAuthStore.js       # Zustand — 로그인 상태, user 정보
│
├── styles/
│   ├── theme.js              # Ant Design ConfigProvider 테마
│   └── tokens/               # 디자인 토큰 (colors, typography, spacing)
│
├── utils/
│   ├── common.js
│   ├── date.js
│   ├── image.js
│   ├── validation.js
│   └── index.js
│
├── App.jsx                   # 라우터 + ConfigProvider + AntApp
└── main.jsx
```

---

## 환경 변수

### 프론트엔드 (`frontend/.env.local`)

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_PORTONE_CHANNEL_KEY=your_channel_key
VITE_SKELETON_DELAY=300   # 개발 중 스켈레톤 확인용 (배포 시 0 또는 제거)
```

### 백엔드 (`backend/src/main/resources/application-secret.yml`)

민감 정보는 GitHub Secrets → Docker Compose 환경변수로 주입.
`docs/deployment.md` 참고.

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
| `/my-stores` | 내 가게 관리 | BUSINESS/ADMIN |
| `/store/register` | 가게 등록 | BUSINESS/ADMIN |
| `/store/:id/edit` | 가게 수정 | BUSINESS/ADMIN |
| `/business` | 사업자 패널 | BUSINESS/ADMIN |
| `/admin` | 관리자 패널 | ADMIN |
| `/payment/result` | 결제 결과 | 로그인 |
