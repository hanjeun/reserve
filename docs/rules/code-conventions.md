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
| 패키지 | lowercase | `kr.it.reserve.reservation` |
| DB 컬럼 | snake_case | `reservation_date` |

### 패키지 구조

```
kr.it.reserve
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

### 로그 컨벤션

**언어: 영어** (서버 로그는 영어, 사용자 메시지는 한국어)

**레벨 기준:**

| 레벨 | 사용 상황 | 예시 |
|---|---|---|
| `INFO` | 정상 비즈니스 흐름 | 가입, 예약 생성, 결제 완료 |
| `WARN` | 예상 가능한 이상 상황 | 인증 실패, 권한 없음, 이메일 발송 실패 |
| `ERROR` | 예상치 못한 오류 | 외부 API 통신 오류, 서버 내부 오류 |
| `DEBUG` | 개발 중 디버깅 (운영 미출력) | 쿼리 파라미터, 중간 계산값 |

**형식:**
```java
// ✅ 정석 — 동사+목적어, 주요 식별자 포함
log.info("Reservation created: storeId={}, memberId={}", storeId, memberId);
log.warn("Authentication failed: errorType={}", e.getClass().getSimpleName());
log.error("Payment cancellation failed: paymentId={}, errorType={}",
        paymentId, e.getClass().getSimpleName());

// ❌ 지양 — 모호하거나 한국어
log.info("완료");
log.info("처리됨: " + id);  // 문자열 연결 금지, 파라미터 사용
```

**개인정보·비밀정보 경계:**

- 애플리케이션 로그에는 이메일, IP, 이름, 주소·검색어, 원본 파일명, 토큰, 외부 API 응답 본문을 직접 남기지 않는다.
- 예외 메시지는 개인정보나 외부 응답을 포함할 수 있으므로 그대로 남기지 않고 `errorType`, 상태 enum, 내부 숫자 ID로 진단한다.
- 보안·운영 알림이 문자열을 기준으로 동작할 때는 기준 문구만 유지한다. 문구 뒤에도 개인정보를 붙이지 않는다.
- `audit_log`의 관리자 감사 기록은 일반 콘솔·파일 로그와 분리해 취급한다. 접근 통제와 보존 정책도 별도 운영 과제로 검증한다.

### 주석 컨벤션

```java
// 한 줄 설명 (why, not what)

/**
 * Javadoc: public Service 메서드에만
 * 구현 세부사항 X, 의도/계약만 작성
 */

// ── 섹션 구분 ─────────────────────────────

// TODO: 나중에 할 것
// FIXME: 알려진 버그
// NOTE: 중요한 맥락 설명
```

**Javadoc 작성 대상:**
- Service public 메서드
- 복잡한 비즈니스 로직
- 외부에서 사용되는 유틸 메서드

**Javadoc 미작성 대상:**
- Repository (메서드명이 충분히 설명적)
- Controller (Swagger로 대체)
- 단순 getter/setter

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
- 상태관리: 인증 등 클라이언트 상태는 Zustand, 서버 데이터(목록/상세/뮤테이션)는 TanStack Query, 로컬 UI 상태는 useState
- API 호출: `services/` 레이어에서만
- import 순서: 외부 라이브러리 → 내부 컴포넌트 → 유틸/훅 → 스타일

### PropTypes

- **`components/common/`(공용 컴포넌트)만 PropTypes 필수.** 재사용되는 곳이라 prop 계약을 명시하는 실익이 있음
- `pages/`, `components/admin/`, `components/store/` 등 1회성 소비 컴포넌트는 PropTypes 생략 — SonarCloud Quality Profile에서 해당 경로는 `react/prop-types` 규칙 제외 처리됨
- 이유: TypeScript 미도입 상태에서 전체 70개 컴포넌트에 PropTypes를 강제하면 유지보수 부담만 커지고 실질적 안전성 이득은 적음. 공용 컴포넌트만이라도 계약을 명시하는 절충안
