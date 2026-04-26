# RESERVE 코드 컨벤션

## 공통

- 들여쓰기: 4 spaces
- 줄 끝 공백 제거
- 파일 끝 개행 1줄
- 인코딩: UTF-8

---

## 백엔드 (Java / Spring Boot)

### 네이밍

| 대상 | 규칙 | 예시 |
|---|---|---|
| 클래스 | PascalCase | `ReservationService` |
| 메서드/변수 | camelCase | `getReservationById` |
| 상수 | UPPER_SNAKE_CASE | `MAX_GUEST_COUNT` |
| 패키지 | lowercase | `com.reserve.reservation` |
| DB 컬럼 | snake_case | `reservation_date` |

### 패키지 구조

```
com.reserve
├── config/          # 설정 (Security, JWT, S3 등)
├── {domain}/
│   ├── controller/  # API 진입점
│   ├── service/     # 비즈니스 로직
│   ├── repository/  # DB 접근
│   ├── dto/         # 요청/응답 객체
│   └── domain/      # 엔티티
└── global/          # 공통 예외, 응답, 유틸
```

### 규칙

- Controller: `@RestController`, URL은 복수형 명사 (`/stores`, `/reservations`)
- Service: 트랜잭션 단위로 메서드 분리
- DTO: 요청은 `~Request`, 응답은 `~Response`
- 예외: `CustomException` + `ErrorCode` enum 사용

---

## 프론트엔드 (React / JavaScript)

### 네이밍

| 대상 | 규칙 | 예시 |
|---|---|---|
| 컴포넌트 파일 | PascalCase | `StoreCard.jsx` |
| 훅 파일 | camelCase + use | `useStoreData.js` |
| 유틸 파일 | camelCase | `formatDate.js` |
| 상수 | UPPER_SNAKE_CASE | `API_BASE_URL` |

### 폴더 구조

```
src/
├── components/
│   ├── common/      # 공통 컴포넌트
│   ├── store/       # 가게 관련
│   └── review/      # 리뷰 관련
├── pages/           # 페이지 단위
├── hooks/           # 커스텀 훅
├── services/        # API 호출
├── store/           # Zustand 전역 상태
├── styles/tokens/   # 디자인 토큰
└── utils/           # 유틸 함수
```

### 규칙

- 컴포넌트: 함수형 + 화살표 함수
- 스타일: 인라인 스타일 + 디자인 토큰 사용 (`colors`, `radius`, `fontSize` 등)
- 상태관리: 전역은 Zustand, 로컬은 useState
- API 호출: `services/` 레이어에서만
- import 순서: 외부 라이브러리 → 내부 컴포넌트 → 유틸/훅 → 스타일
