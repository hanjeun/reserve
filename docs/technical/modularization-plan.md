# 백엔드·프론트 구조 개편 계획 — 모듈러 모놀리스로 점진 전환

> 작성 2026-09-23. 근거 수치는 같은 날 코드를 직접 파싱해 측정했다(import 그래프). 코드가 바뀌면 수치도 다시 잰다.

## 1. 결론 — 전면 재작성(DDD·헥사고날로 갈아엎기)은 하지 않는다

지금 구조는 **도메인별 패키지 + 안쪽은 계층형**(controller / service / repository / entity)이다.
이건 이미 "레이어드 아키텍처를 기능별로 묶은" 형태라 방향이 틀리지 않았다. 문제는 **도메인 경계가 코드로 강제되지 않아서
서로 안쪽 저장소를 직접 여는 것**이다. 그래서 목표는 새 아키텍처로 바꾸는 게 아니라, 지금 모양을 유지한 채
**경계를 강제하는 모듈러 모놀리스**로 굳히는 것이다.

| 선택지 | 판단 |
|---|---|
| 전면 DDD 재작성(애그리거트·바운디드 컨텍스트 전부 재설계) | ✕ 2만 줄을 다시 쓰는 비용 대비 사용자 가치 없음. 결제·환불 회귀 위험이 크다 |
| 전면 헥사고날(모든 도메인에 포트·어댑터) | ✕ 1인 프로젝트에 파일 수만 2~3배. 이득은 외부 연동 경계에서만 난다 |
| 3티어로 되돌리기 | ✕ 이미 3계층을 도메인별로 나눠 둔 상태 — 오히려 후퇴 |
| **모듈러 모놀리스 (도메인 = 모듈, 모듈 간 이벤트·공개 API만 허용, 테스트로 강제)** | ○ 지금 코드에서 점진적으로 갈 수 있고, 수치로 개선을 보여줄 수 있다 |
| 헥사고날은 **외부 연동 경계에만** (PortOne·S3·Resend·관광 API) | ○ 이미 클라이언트 클래스가 있어 포트 인터페이스만 세우면 된다 |

## 2. 현재 수치 (2026-09-23)

| 지표 | 값 |
|---|---|
| 도메인 간 양방향 의존 | **19쌍** |
| 다른 도메인 저장소를 서비스가 직접 여는 import | **58건** |
| 다른 도메인 엔티티를 서비스가 쓰는 import | 44건 |
| 도메인 간 이벤트 | 사실상 0 (백필 러너 1곳) |
| `MemberService` 주입 의존 | **20개** (그중 10개가 탈퇴 전용) |
| `StoreService` | 804줄 · 주입 11개 |
| 프론트 순환 의존 / 중복 코드 | 0개 / 0.6% (양호) |
| `feature-surfaces.css` | 2,383줄 · 기능 접두어 96종 |

### 양방향 의존의 실제 원인 — 거의 한 가지 패턴이다

| 원인 | 만드는 양방향 쌍 |
|---|---|
| **회원 탈퇴**가 찜·프로모션·결제·예약·커뮤니티·사업자 인증 저장소를 직접 확인 (`MemberService`) | member⇄favorite, promotion, payment, reservation, community, business (6쌍) |
| **가게 폐업**이 찜·프로모션·결제·예약·광고 저장소를 직접 확인 (`StoreService`) | store⇄favorite, promotion, payment, reservation, lifecycle (5쌍) |
| **감사 로그 정리**가 광고·예약·메일 저장소를 직접 연다 (`AuditLogService`, `AuditCleanupWorker`) | audit⇄advertisement, reservation, mailbox (3쌍) |
| 결제 ↔ 예약 · 광고 결제의 직접 호출 | payment⇄reservation, advertisement⇄payment, payment⇄store (3쌍) |
| 가게 검색의 광고 우선 정렬(`StoreSearchSpecification` → `Advertisement`) | advertisement⇄store (1쌍) |
| 보안 설정이 회원 엔티티·서비스를 직접 사용 | config⇄member (1쌍) — 인프라라 우선순위 낮음 |

## 3. 단계별 계획

각 단계는 독립 PR 이고, 끝날 때마다 위 표의 수치를 다시 잰다.

### 0단계 — 규칙부터 코드로 강제 (반나절)
- Spring Modulith(`ApplicationModules.verify()`) 또는 ArchUnit 테스트를 추가한다.
- **현재 위반 19쌍은 기준선으로 기록하고, 새 위반만 실패**시킨다(래칫). 줄어들면 기준선도 줄인다.
- 이 프로젝트의 원칙("규칙은 주석이 아니라 관문으로 강제") 그대로다.

### 1단계 — 탈퇴·폐업을 조율 서비스로 분리 (2~3일, 효과 최대)
- `lifecycle` 모듈에 `MemberWithdrawalService`, `StoreClosureService` 를 둔다.
- 각 도메인은 "탈퇴·폐업을 막는 사유"를 **자기 모듈 안에서** 계산해 공개 인터페이스로 내놓는다.
  예: `WithdrawalBlocker { List<Reason> blockersFor(Long memberId); }` 를 결제·예약·찜 모듈이 각각 구현하고,
  조율 서비스는 `List<WithdrawalBlocker>` 만 주입받는다(의존 역전).
- 기대 효과: 양방향 **19 → 약 8쌍**, `MemberService` 주입 **20 → 약 9개**, `StoreService` 주입 11 → 약 6개.

### 2단계 — 모듈 사이는 이벤트로 (3~5일)
- 결제 확정 → 예약 확정, 광고 결제 웹훅 → 광고 활성화, 예약 상태 변경 → 감사 로그를
  `@TransactionalEventListener(AFTER_COMMIT)` 이벤트로 바꾼다.
- 이벤트 유실이 곤란한 경로(결제·환불)는 이미 쓰고 있는 **아웃박스 패턴**(파일 삭제·소셜 연동 해제와 같은 방식) 또는
  Spring Modulith 이벤트 발행 저장소로 보장한다.
- 감사 로그 정리는 각 모듈이 보존 기한을 등록하게 바꿔 audit 이 남의 저장소를 열지 않게 한다.

### 3단계 — 거대 서비스를 유스케이스별로 (1주)
- `StoreService` → 조회(`StoreQueryService`) / 등록·수정(`StoreCommandService`) / 영업 상태.
- `ReservationService` → 손님 예약 / 사장님 처리 / 만료·스케줄러.
- `PaymentService` 는 결제 대행사 연동부를 `PaymentGateway` 포트 뒤로 숨긴다(헥사고날은 여기만).

### 4단계 — 프론트
- `feature-surfaces.css` 를 기능별 파일로 나눈다. 새 기능부터 이미 이렇게 한다
  (`region-sheet.css`, `store-listing-toolbar.css`, `chat-intro.css`).
- `MyPage.jsx`(1,086줄·컴포넌트 9개)는 탭별 파일로, `MessengerContent.jsx`(741줄)는 목록·대화·입력으로 나눈다.

## 4. 하지 않을 것
- 패키지 이름·폴더 구조를 한 번에 바꾸는 대규모 이동 (git 이력과 리뷰가 망가진다)
- 모든 엔티티를 값 객체·애그리거트로 재설계
- 마이크로서비스 분리 (서버 메모리 여유 600MB, 1인 운영 — 이득 없음)

## 5. 완료 기준
- 0단계 테스트가 CI 에서 돈다.
- 양방향 의존 19 → 3 이하 (config⇄member 같은 인프라 예외만 남김), 다른 도메인 저장소 직접 접근 58 → 10 이하.
- 주입 의존 10개 넘는 서비스 0개.

## 진행 상황

- **0단계 완료 (2026-09-24)** — `backend/src/test/java/kr/it/reserve/architecture/ModuleBoundaryTest.java`. ArchUnit 로 모듈(`kr.it.reserve.*`) 사이 양방향 의존 쌍을 세고, 기준선 19쌍(바이트코드 실측, 계획서 수치와 일치)보다 늘거나 줄었는데 목록이 그대로면 실패한다. ArchUnit 순환 동결(freeze)은 기본 탐지 한도 100개에 걸려 기준선이 흔들려서 쓰지 않았다. 의존성 잠금(`gradle.lockfile`)에 archunit 1.3.0 추가.
- 다음: 1단계(탈퇴·폐업 조율 서비스) — 끝나면 기준선에서 member⇄*·store⇄* 쌍을 지운다.
