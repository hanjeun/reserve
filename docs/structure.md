# 프로젝트 폴더 구조

---

## 모노레포 루트

```
RESERVE/
├── backend/                  # Spring Boot 3.5.6 / Java 21
├── frontend/                 # React 19 / Vite 7
├── docs/                     # 프로젝트 문서
│   ├── deployment.md         # EC2 / Docker / GitHub Actions
│   ├── design-system.md      # 디자인 토큰 & 컴포넌트 가이드
│   └── structure.md          # 이 파일
├── .github/workflows/
│   └── CICD.yml              # Blue/Green 자동 배포
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
├── payment/                  # 포트원 V1/V2 결제
├── favorite/                 # 즐겨찾기
├── review/                   # 리뷰 작성/수정/삭제
├── admin/                    # 관리자 기능
├── certification/            # 사업자 인증
├── notification/             # 알림 (SSE 예정)
└── global/
    ├── config/               # SecurityConfig, WebMvcConfig, CorsConfig
    ├── exception/            # GlobalExceptionHandler
    └── util/
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
│   │   ├── Skeletons.jsx     # 각 페이지별 스켈레톤 컴포넌트
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
│   ├── useMyStores.js            # 내 가게 목록 + 삭제
│   ├── usePayment.js             # 포트원 결제 플로우
│   ├── useReservations.js        # 내 예약 목록 + 취소
│   ├── useStoreData.js           # 가게 상세 fetch
│   ├── useStoreList.js           # 가게 목록 검색/정렬
│   └── index.js
│
├── pages/
│   ├── admin/
│   │   └── AdminPanel.jsx        # 관리자 (인증심사, 전체 예약)
│   ├── auth/
│   │   ├── Login.jsx
│   │   ├── Signup.jsx
│   │   └── OAuthCallback.jsx
│   ├── business/
│   │   └── BusinessPanel.jsx     # 사업자 (예약 승인/거절/완료/노쇼)
│   ├── favorite/
│   │   └── MyFavorites.jsx
│   ├── Home/
│   │   ├── index.jsx             # 랜딩 페이지
│   │   └── sections/             # 히어로, 기능 소개 등 섹션 분리
│   ├── member/
│   │   └── MyPage.jsx            # 프로필/비번 변경, 회원탈퇴
│   ├── payment/
│   │   └── PaymentResult.jsx
│   ├── reservation/
│   │   └── MyReservations.jsx
│   └── store/
│       ├── StoreDetail.jsx       # 가게 상세 + 예약 폼 (PC 2컬럼)
│       ├── StoreEdit.jsx
│       ├── StoreList.jsx
│       ├── StoreRegister.jsx
│       └── MyStores.jsx
│
├── services/                 # API 호출 레이어 (axios 래핑)
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
│       └── index.js
│
├── utils/
│   ├── common.js             # formatCurrency, debounce
│   ├── date.js               # formatDate, formatTime, formatTimeForApi
│   ├── image.js              # getThumbnailUrl, getDetailImageUrl
│   ├── validation.js         # VALIDATION_RULES (AntD Form rules)
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
VITE_SKELETON_DELAY=300   # 개발 중 스켈레톤 확인용 (배포 시 0)
```

### 백엔드 (`backend/src/main/resources/application-prod.yml`)

민감 정보는 GitHub Secrets → Docker Compose 환경변수로 주입.  
`docs/deployment.md` 참고.
