# 모듈러 모놀리스 전환 계획

지금 구조를 갈아엎지 않고, 도메인 경계를 테스트로 강제하는 모듈러 모놀리스로 조금씩 굳혀 가는 계획이에요.

## 결론 — 전면 재작성은 하지 않아요

지금 구조는 **도메인별 패키지 + 안쪽은 계층형**(controller / service / repository / entity)이에요. 방향은 맞고, 문제는 도메인 경계가 코드로 강제되지 않아 서로의 저장소를 직접 연다는 점이에요. 그래서 목표는 새 아키텍처가 아니라 지금 모양 그대로 **경계를 강제하는 것**이에요.

| 선택지 | 판단 |
|---|---|
| 전면 DDD 재작성 (애그리거트·바운디드 컨텍스트 재설계) | 안 함. 2만 줄을 다시 쓰는 비용에 비해 사용자 가치가 없고 결제·환불 회귀 위험이 커요 |
| 전면 헥사고날 (모든 도메인에 포트·어댑터) | 안 함. 1인 프로젝트에 파일 수만 2~3배, 이득은 외부 연동 경계에서만 나요 |
| 3티어로 되돌리기 | 안 함. 이미 3계층을 도메인별로 나눈 상태라 후퇴예요 |
| **모듈러 모놀리스** (도메인 = 모듈, 모듈 간엔 이벤트·공개 API만, 테스트로 강제) | **채택.** 지금 코드에서 점진적으로 갈 수 있고 수치로 개선을 보여 줄 수 있어요 |
| 헥사고날은 **외부 연동 경계에만** (PortOne·S3·Resend·관광 API) | **채택.** 클라이언트 클래스가 이미 있어 포트 인터페이스만 세우면 돼요 |

## 기준 수치

전환을 시작할 때 import 그래프로 잰 값이에요. 단계가 끝날 때마다 다시 재요.

| 지표 | 값 |
|---|---|
| 도메인 간 양방향 의존 | **19쌍** |
| 다른 도메인 저장소를 서비스가 직접 여는 import | **58건** |
| 다른 도메인 엔티티를 서비스가 쓰는 import | 44건 |
| 도메인 간 이벤트 | 사실상 0 (백필 러너 1곳) |
| `MemberService` 주입 의존 | **20개** (그중 10개가 탈퇴 전용) |
| `StoreService` | 804줄 · 주입 11개 |
| 프론트 순환 의존 / 중복 코드 | 0개 / 0.6% |
| `feature-surfaces.css` | 2,383줄 · 기능 접두어 96종 |

### 양방향 의존의 원인

거의 한 가지 패턴이에요. 탈퇴·폐업·정리 작업이 남의 저장소를 직접 확인해요.

| 원인 | 만드는 양방향 쌍 |
|---|---|
| **회원 탈퇴**가 찜·프로모션·결제·예약·커뮤니티·사업자 인증 저장소를 직접 확인 (`MemberService`) | member⇄favorite, promotion, payment, reservation, community, business (6쌍) |
| **가게 폐업**이 찜·프로모션·결제·예약·광고 저장소를 직접 확인 (`StoreService`) | store⇄favorite, promotion, payment, reservation, lifecycle (5쌍) |
| **감사 로그 정리**가 광고·예약·메일 저장소를 직접 엶 (`AuditLogService`, `AuditCleanupWorker`) | audit⇄advertisement, reservation, mailbox (3쌍) |
| 결제 ↔ 예약·광고 결제의 직접 호출 | payment⇄reservation, advertisement⇄payment, payment⇄store (3쌍) |
| 가게 검색의 광고 우선 정렬 (`StoreSearchSpecification` → `Advertisement`) | advertisement⇄store (1쌍) |
| 보안 설정이 회원 엔티티·서비스를 직접 사용 | config⇄member (1쌍) — 인프라라 우선순위 낮음 |

## 단계

각 단계는 독립 PR이고, 끝날 때마다 위 수치를 다시 재요.

### 0단계 — 규칙부터 코드로 강제 (완료)

- `backend/src/test/java/kr/it/reserve/architecture/ModuleBoundaryTest.java`가 ArchUnit으로 모듈(`kr.it.reserve.*`) 사이 양방향 의존 쌍을 세요.
- 기준선 19쌍보다 **늘거나, 줄었는데 기준선 목록이 그대로면** 실패해요(래칫). 줄면 기준선도 같이 줄여요.
- ArchUnit 순환 동결(freeze)은 기본 탐지 한도 100개에 걸려 기준선이 흔들려서 쓰지 않아요.
- 의존성 잠금(`gradle.lockfile`)에 archunit 1.3.0이 들어 있어요.

### 1단계 — 탈퇴·폐업을 조율 서비스로 분리 (다음, 효과 최대)

- `lifecycle` 모듈에 `MemberWithdrawalService`, `StoreClosureService`를 둬요.
- 각 도메인은 탈퇴·폐업을 막는 사유를 **자기 모듈 안에서** 계산해 공개 인터페이스로 내놓아요. 조율 서비스는 그 목록만 주입받아요(의존 역전).

```java
WithdrawalBlocker { List<Reason> blockersFor(Long memberId); }
```

- 기대 효과: 양방향 **19 → 약 8쌍**, `MemberService` 주입 **20 → 약 9개**, `StoreService` 주입 11 → 약 6개.
- 끝나면 `ModuleBoundaryTest` 기준선에서 member⇄*·store⇄* 쌍을 지워요.

### 2단계 — 모듈 사이는 이벤트로

- 결제 확정 → 예약 확정, 광고 결제 웹훅 → 광고 활성화, 예약 상태 변경 → 감사 로그를 `@TransactionalEventListener(AFTER_COMMIT)` 이벤트로 바꿔요.
- 유실되면 곤란한 경로(결제·환불)는 이미 쓰는 **아웃박스 패턴**(파일 삭제·소셜 연동 해제와 같은 방식)이나 Spring Modulith 이벤트 발행 저장소로 보장해요.
- 감사 로그 정리는 각 모듈이 보존 기한을 등록하게 바꿔 audit이 남의 저장소를 열지 않게 해요.

### 3단계 — 거대 서비스를 유스케이스별로

- `StoreService` → 조회(`StoreQueryService`) / 등록·수정(`StoreCommandService`) / 영업 상태
- `ReservationService` → 손님 예약 / 사장님 처리 / 만료·스케줄러
- `PaymentService`는 결제 대행사 연동부를 `PaymentGateway` 포트 뒤로 숨겨요(헥사고날은 여기만).

### 4단계 — 프론트

- `feature-surfaces.css`를 기능별 파일로 나눠요. 새 기능은 이미 이렇게 해요(`region-sheet.css`, `store-listing-toolbar.css`, `chat-intro.css`).
- `MyPage.jsx`(1,086줄·컴포넌트 9개)는 탭별 파일로, `MessengerContent.jsx`(741줄)는 목록·대화·입력으로 나눠요.

## 하지 않을 것

- 패키지 이름·폴더 구조를 한 번에 바꾸는 대규모 이동 — git 이력과 리뷰가 망가져요
- 모든 엔티티를 값 객체·애그리거트로 재설계
- 마이크로서비스 분리 — 서버 메모리 여유 600MB, 1인 운영이라 이득이 없어요

## 완료 기준

- 0단계 테스트가 CI에서 돌아야 해요.
- 양방향 의존 19 → 3 이하(config⇄member 같은 인프라 예외만), 다른 도메인 저장소 직접 접근 58 → 10 이하여야 해요.
- 주입 의존이 10개를 넘는 서비스가 없어야 해요.
