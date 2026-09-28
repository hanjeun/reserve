# RESERVE 코드 컨벤션

새로 쓰거나 고치는 코드의 기준이에요.

- 동작의 근거는 코드와 테스트예요. 기능 변경과 무관한 일괄 포맷 수정은 따로 분리해요.
- 디자인은 [디자인 시스템](../technical/design-system.md), Git은 [Git 워크플로우](git-workflow.md)를 따라요.

## 공통

- 들여쓰기: 소스는 4 spaces. JSON·YAML·기존 설정 파일은 원래 형식을 유지
- 줄 끝 공백 제거
- 파일 끝 개행 1줄
- 인코딩 UTF-8, 줄바꿈 LF (`.gitattributes` 기준)

### 수정 범위

- 요청받은 부분만 수정해요. 요청과 무관한 코드·스타일·문구·애니메이션·레이아웃·동작은 바꾸지 않아요.
- 같은 버그 패턴의 전수 수정은 요청 범위에 들어가요. 그 밖의 정리·리팩터링·이름 변경·포맷팅·애니메이션 변경은 하지 않아요.
- 고치다가 다른 문제를 발견하면 먼저 보고하고 승인받아요.
- 공통 컴포넌트·디자인 토큰·전역 CSS를 바꿀 때는 영향받는 화면을 먼저 확인하고 알려요.
- 결과를 보고할 때 바꾼 파일과 이유를 밝혀요.

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
- Service: 트랜잭션 단위로 메서드를 나눠요.
- DTO: 요청은 `~Request`, 응답은 `~Response`
- 예외: `BusinessException`과 도메인 하위 예외(`PaymentException` 등), `HttpStatus`를 써요.
- 공개 응답은 DTO로 분리해요. 엔티티나 관리자 전용 필드를 그대로 반환하지 않아요.
- 트랜잭션 안에서 RuntimeException을 던지면 DB 변경도 롤백될 수 있어요. 실패 상태를 대입한 것만으로 저장됐다고 판단하지 않아요.
- PG 타임아웃은 미결 상태로 다뤄요. 외부 성공과 DB 성공을 분리하고, 멱등 키·처리 기록·재조회 경로를 설계해요. ERROR 로그로 대사를 대신하지 않아요.
- 목록은 서버에서 권한·검색·필터 → 정렬 → 페이지 분할 순서로 처리해요. count에도 같은 필터를 적용하고, 동률 정렬에는 id를 추가하고, 페이지 크기는 서버에서 제한해요.
- UTC로 저장하는 타임스탬프(`LocalDateTime.now()`)와 한국 영업일(`ServiceTime`)을 구분해요. 컨테이너 TZ를 임의로 바꾸지 않아요.

### 로그

서버 로그는 **영어**, 사용자 메시지는 한국어로 써요.

| 레벨 | 사용 상황 | 예시 |
|---|---|---|
| `INFO` | 정상 비즈니스 흐름 | 가입, 예약 생성, 결제 완료 |
| `WARN` | 예상 가능한 이상 상황 | 인증 실패, 권한 없음, 이메일 발송 실패 |
| `ERROR` | 예상치 못한 오류 | 외부 API 통신 오류, 서버 내부 오류 |
| `DEBUG` | 개발 중 디버깅 (운영 미출력) | 쿼리 파라미터, 중간 계산값 |

```java
// 좋은 예 — 동사+목적어, 주요 식별자 포함
log.info("Reservation created: storeId={}, memberId={}", storeId, memberId);
log.warn("Authentication failed: errorType={}", e.getClass().getSimpleName());
log.error("Payment cancellation failed: paymentId={}, errorType={}",
        paymentId, e.getClass().getSimpleName());

// 나쁜 예 — 모호하거나 한국어
log.info("완료");
log.info("처리됨: " + id);  // 문자열 연결 금지, 파라미터 사용
```

로그에 남기지 않는 것

- 이메일, IP, 이름, 주소·검색어, 원본 파일명, 토큰, 외부 API 응답 본문을 애플리케이션 로그에 직접 남기지 않아요.
- 예외 메시지를 그대로 남기지 않고 `errorType`, 상태 enum, 내부 숫자 ID로 진단해요.
- 보안·운영 알림이 문자열로 동작하면 기준 문구만 유지하고, 개인정보를 붙이지 않아요.
- `audit_log`의 관리자 감사 기록은 일반 콘솔·파일 로그와 따로 다루고, 접근 통제와 보존 정책도 별도로 관리해요.

### 주석

주석은 한국어·영어 모두 괜찮아요.

| 위치 | 남길 내용 | 남기지 않을 내용 |
|---|---|---|
| 공개 서비스·공용 훅·컴포넌트 | 입력·반환 계약, 권한, 상태 전이, 부작용 | 이름을 반복하는 형식적인 설명 |
| 구현·복잡한 쿼리 | 잠금 순서, 실패 조건, 필터·count 일치 이유 | 코드를 한 줄씩 번역한 설명 |
| CSS·워크플로우 | 우선순위·호환성·배포 가드의 이유 | 과거 테스트 개수·속도, 옛 구현을 현재처럼 표현 |
| 회귀 기록 | 재현 조건, 방지 테스트·문서 경로 | 날짜별 대화록, 감탄·별표 반복 |

- 긴 판단 과정은 관련 기술 문서에, 현재 불변식과 짧은 이유는 코드에 남겨요.
- JS에는 Java 전용 인라인 code 태그나 HTML 제목 대신 평문/JSDoc을 써요.
- CSS 주석 안에 주석 종료 문자를 쓰지 않고, JSX 템플릿 안 주석도 문자열 문법을 지켜요.

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

| Javadoc 작성 | Javadoc 생략 |
|---|---|
| Service public 메서드 | 메서드명이 충분히 설명적인 단순 Repository |
| 복잡한 Repository 쿼리의 계약·잠금 정책 | API 문서와 중복되는 단순 Controller 설명 |
| 외부에서 쓰는 유틸 메서드 | 단순 getter/setter |

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
- 스타일: 인라인 스타일 + 디자인 토큰 (`colors`, `radius`, `fontSize` 등)
- 상태 관리: 인증 등 클라이언트 상태는 Zustand, 서버 데이터(목록/상세/뮤테이션)는 TanStack Query, 로컬 UI 상태는 useState
- 새 API 호출은 `services/` 레이어에 둬요. 기존 직접 호출은 그 기능을 고칠 때 옮겨요.
- query key에 페이지·검색·필터를 넣어요. 필터가 바뀌면 첫 페이지로 돌아가고, 뮤테이션 후에는 관련 목록 캐시를 무효화해요.
- 뮤테이션 후 무효화 대상은 `hooks/invalidateAfterWrite.js`에서 골라요. 기준은 그 쓰기가 바꾸는 서버 데이터예요(예: 리뷰 작성 → 가게 별점·내 예약의 리뷰 버튼까지).
- Page 전체 건수는 `result?.page?.totalElements ?? result?.totalElements ?? 0`로 읽어요. 첫 페이지 배열 길이를 총합으로 쓰지 않아요.
- 로딩·정상 0건·조회 실패를 구분해요. 삭제 준비도 같은 허가 값은 명시적인 `true`만 허용해요.
- 전역 CSS는 `index.css`나 여기서 import하는 `styles/global/` 모듈에만 둬요. JSX 전역 `<style>`은 금지예요.
- 일반 모션과 reduced motion 검증을 구분해요.
- import 순서: 외부 라이브러리 → 내부 컴포넌트 → 유틸/훅 → 스타일

### PropTypes

- `components/common/`(공용 컴포넌트)만 PropTypes가 필수예요.
- `pages/`, `components/admin/`, `components/store/` 같은 1회성 소비 컴포넌트는 생략해요.

## 검사 명령

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

- ESLint는 필드 오류 토스트, JS 주석의 다른 언어용 마크업, JSX 전역 style 요소를 검사해요.
- `test:policy`는 이 규칙과 PR 필수 체크 누락 판정을 검증해요.
