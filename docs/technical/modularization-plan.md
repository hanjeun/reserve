# 모듈러 모놀리스 전환 계획

지금 구조를 유지하면서 도메인 경계를 테스트로 강제하는 모듈러 모놀리스로 굳혀 가는 계획이에요.

## 방향

- 구조는 **도메인별 패키지 + 안쪽은 계층형**(controller / service / repository / entity)을 유지해요.
- `kr.it.reserve` 바로 아래 패키지 하나가 모듈이에요. 모듈 사이는 이벤트나 공개 인터페이스로만 연결해요.
- 헥사고날(포트·어댑터)은 외부 연동 경계(PortOne·S3·Resend·관광 API)에만 적용해요.

## 기준선

단계가 끝날 때마다 다시 재요.

| 지표 | 기준선 |
|---|---|
| 도메인 간 양방향 의존 | 19쌍 |
| 다른 도메인 저장소를 서비스가 직접 여는 import | 58건 |
| `MemberService` 주입 의존 | 20개 |
| `StoreService` 주입 의존 | 11개 |

## 단계

각 단계는 독립 PR로 진행해요.

### 0단계 — 규칙을 테스트로 강제

- `backend/src/test/java/kr/it/reserve/architecture/ModuleBoundaryTest.java`가 ArchUnit으로 모듈 사이 양방향 의존 쌍을 세요.
- 기준선 목록에 없는 쌍이 생기면 실패해요.
- 기준선의 쌍이 없어졌는데 목록에 남아 있어도 실패해요. 줄어든 쌍은 목록에서 지워요.
- ArchUnit 순환 동결(freeze)은 쓰지 않아요.

### 1단계 — 탈퇴·폐업을 조율 서비스로 분리

- `lifecycle` 모듈에 `MemberWithdrawalService`, `StoreClosureService`를 둬요.
- 각 도메인은 탈퇴·폐업을 막는 사유를 자기 모듈 안에서 계산해 공개 인터페이스로 내놓고, 조율 서비스는 그 목록만 주입받아요.

```java
WithdrawalBlocker { List<Reason> blockersFor(Long memberId); }
```

- 목표: 양방향 19 → 약 8쌍, `MemberService` 주입 20 → 약 9개, `StoreService` 주입 11 → 약 6개.
- 끝나면 `ModuleBoundaryTest` 기준선에서 member⇄*·store⇄* 쌍을 지워요.

### 2단계 — 모듈 사이는 이벤트로

- 결제 확정 → 예약 확정, 광고 결제 웹훅 → 광고 활성화, 예약 상태 변경 → 감사 로그를 `@TransactionalEventListener(AFTER_COMMIT)` 이벤트로 바꿔요.
- 결제·환불 경로는 아웃박스 패턴이나 Spring Modulith 이벤트 발행 저장소로 전달을 보장해요.
- 감사 로그 정리는 각 모듈이 보존 기한을 등록하게 해서 audit이 다른 모듈 저장소를 열지 않게 해요.

### 3단계 — 큰 서비스를 유스케이스별로

- `StoreService` → 조회(`StoreQueryService`) / 등록·수정(`StoreCommandService`) / 영업 상태
- `ReservationService` → 손님 예약 / 사장님 처리 / 만료·스케줄러
- `PaymentService`는 결제 대행사 연동부를 `PaymentGateway` 포트 뒤로 숨겨요.

### 4단계 — 프론트

- `feature-surfaces.css`를 기능별 파일로 나눠요(예: `region-sheet.css`, `store-listing-toolbar.css`, `chat-intro.css`).
- `MyPage.jsx`는 탭별 파일로, `MessengerContent.jsx`는 목록·대화·입력으로 나눠요.

## 하지 않을 것

- 패키지 이름·폴더 구조를 한 번에 바꾸는 대규모 이동
- 모든 엔티티를 값 객체·애그리거트로 재설계
- 마이크로서비스 분리

## 완료 기준

- 0단계 테스트가 CI에서 돌아요.
- 양방향 의존 3쌍 이하(config⇄member 같은 인프라 예외만), 다른 도메인 저장소 직접 접근 10건 이하예요.
- 주입 의존이 10개를 넘는 서비스가 없어요.
