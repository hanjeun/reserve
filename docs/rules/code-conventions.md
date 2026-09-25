# RESERVE 코드 컨벤션

새 코드와 변경한 코드의 기준이다. 기존 코드 전체가 이미 만족한다는 뜻은 아니다.
코드·테스트가 현재 동작의 근거이며, 기능 변경과 무관한 일괄 포맷 수정은 분리한다.
디자인은 [디자인 시스템](../technical/design-system.md), Git은 [Git 워크플로우](git-workflow.md)가 정본이다.

## 공통

- 들여쓰기: 소스 4 spaces. JSON·YAML·기존 설정 파일의 형식은 유지
- 줄 끝 공백 제거
- 파일 끝 개행 1줄
- 인코딩: UTF-8, 줄바꿈 LF (`.gitattributes` 기준)

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
│   └── entity/      # 엔티티
└── global/          # 공통 예외, 응답, 유틸
```

### 규칙

- Controller: `@RestController`, URL은 복수형 명사 (`/stores`, `/reservations`)
- Service: 트랜잭션 단위로 메서드 분리
- DTO: 요청은 `~Request`, 응답은 `~Response`
- 예외: 실제 구현인 `BusinessException`과 도메인 하위 예외(`PaymentException` 등), `HttpStatus` 사용
- 공개 응답은 DTO로 분리. 엔티티·관리자 전용 필드를 그대로 반환하지 않음
- 트랜잭션에서 RuntimeException을 던지면 DB 변경도 롤백될 수 있음. 실패 상태를 대입한 것만으로 저장 완료라고 판단하지 않음
- PG 타임아웃은 미결 상태. 외부 성공과 DB 성공을 분리하고 멱등 키·내구성 있는 처리 기록·재조회 경로를 설계함. ERROR 로그는 대사 큐를 대신하지 않음
- 목록은 서버에서 권한·검색·필터 → 정렬 → 페이지 분할. count도 같은 필터 적용, 동률 정렬에는 id 추가, 페이지 크기는 서버에서 제한
- UTC 저장 타임스탬프(`LocalDateTime.now()`)와 한국 영업일(`ServiceTime`)을 구분. 컨테이너 TZ를 임의로 바꾸지 않음

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

주석 언어는 한국어·영어 모두 허용한다. 영어 서버 로그 규칙을 주석에 확대하지 않는다.

| 위치 | 남길 내용 | 옮기거나 줄일 내용 |
|---|---|---|
| 공개 서비스·공용 훅·컴포넌트 | 입력·반환 계약, 권한, 상태 전이, 부작용 | 이름을 반복하는 형식적인 설명 |
| 구현·복잡한 쿼리 | 잠금 순서, 실패 조건, 필터·count 일치 이유 | 코드를 한 줄씩 번역한 설명 |
| CSS·워크플로우 | 우선순위·호환성·배포 가드의 이유 | 과거 테스트 개수·속도, 옛 구현을 현재처럼 표현 |
| 회귀 기록 | 재현 조건, 방지 테스트·문서 경로 | 날짜별 대화록, 감탄·별표 반복, 근거 없는 수정 금지 |

긴 판단 과정은 관련 기술 문서에, 현재 불변식과 짧은 이유는 코드에 남긴다.
JS에는 Java 전용 인라인 code 태그나 HTML 제목 대신 평문/JSDoc을 쓴다.
CSS 주석 종료 문자를 주석 안에 적지 않고, JSX 템플릿 안의 주석도 문자열 문법을 지킨다.

```java
// 한 줄 설명 (why, not what)

/**
 * Javadoc: 공개 계약에 의미가 있을 때
 * 권한, 상태 전이, 부작용과 실패 조건을 설명
 */

// ── 섹션 구분 ─────────────────────────────

// TODO: 해결 조건과 관련 문서/이슈를 명시
// FIXME: 재현 조건과 회귀 테스트를 명시
// NOTE: 중요한 맥락 설명
```

**Javadoc 작성 대상:**
- Service public 메서드
- 복잡한 Repository 쿼리의 계약·잠금 정책
- 외부에서 사용되는 유틸 메서드

**Javadoc 미작성 대상:**
- 메서드명이 충분히 설명적인 단순 Repository
- API 문서와 중복되는 단순 Controller 설명
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
- 새 API 호출은 `services/` 레이어로. 기존 직접 호출은 해당 기능을 수정할 때 이전하며 이미 모두 완료됐다고 가정하지 않음
- query key에 페이지·검색·필터 포함. 필터 변경 시 첫 페이지로 복귀하고 뮤테이션 후 관련 목록 캐시 무효화
- Page 전체 건수는 `result?.page?.totalElements ?? result?.totalElements ?? 0`. 첫 페이지 배열 길이를 총합으로 사용하지 않음
- 로딩·정상 0건·조회 실패를 구분. 삭제 준비도 같은 허가 값은 명시적인 `true`만 허용
- 전역 CSS는 `index.css` 또는 여기서 import하는 `styles/global/` 모듈. JSX 전역 `<style>` 금지
- 일반 모션·reduced motion 검증을 구분. reduced motion 테스트 통과는 일반 애니메이션 정상 증거가 아님
- import 순서: 외부 라이브러리 → 내부 컴포넌트 → 유틸/훅 → 스타일

### PropTypes

- **`components/common/`(공용 컴포넌트)만 PropTypes 필수.** 재사용되는 곳이라 prop 계약을 명시하는 실익이 있음
- `pages/`, `components/admin/`, `components/store/` 등 1회성 소비 컴포넌트는 PropTypes 생략. 분석 도구의 실제 예외 설정은 별도 확인
- TypeScript 미도입 상태에서 공용 컴포넌트의 계약을 명시하는 기존 절충안. 서버 검증·회귀 테스트를 대체하지 않음

## 실행 가능한 관문

```bash
# backend (Windows: .\gradlew.bat)
./gradlew test
# frontend — .nvmrc의 Node 22 계열
npm run lint:ci
npm run test:policy
npm run test:run
npm run test:e2e
npm run build
# 저장소 루트
node scripts/validate-grafana-dashboards.mjs
node scripts/pr-review-audit.mjs
```

ESLint는 필드 오류 토스트·JS 주석의 다른 언어용 마크업·JSX 전역 style 요소를 검사한다.
`test:policy`는 이 규칙과 PR 필수 체크 누락 판정을 검증한다. CI 성공은 실제 PG·운영 DB·복원 검증을 대신하지 않는다.
