# 결제 · 환불

PortOne V2(구 아임포트) + 카카오페이로 받은 돈이 어떻게 확정되고, 어떻게 돌려주고, 어긋났을 때 무엇을 하는지 정리해요.

> 주의: 마지막으로 확인한 운영 채널은 `TEST`예요. 실제 결제 작업 전에는 PortOne 콘솔에서 현재 채널을 다시 확인하세요.

광고는 별도 `AdPaymentAttempt` 원장과 다른 상태기계를 써요. 이 문서의 예약 규칙을 광고에 그대로 적용하지 말고 [광고 결제 런북](ad-payments.md)을 따르세요.
결제·환불 미결 건이 회원 탈퇴와 가게 영업 종료를 어떻게 막는지는 [데이터 생명주기](data-lifecycle.md)에 있어요.

## 왜 따로 관리하나

이 프로젝트에서 되돌릴 수 없는 일은 **돈이 움직이는 것** 하나뿐이에요. 잘못 나간 환불은 되돌릴 수 없으니, 환불 경로는 **무엇을 시도했고 어떻게 끝났는지가 항상 데이터로 남아야** 해요.

결제 성립에도 같은 원칙을 적용해요. 브라우저가 결제 뒤 돌아오지 않거나 PG 조회가 잠시 실패해도 "결제됐을 가능성이 있는 예약"을 미결제로 단정해 취소하지 않아요.

## 결제 성립 — 브라우저와 웹훅이 같은 잠금 관문을 써요

`PaymentService`의 브라우저 검증과 PortOne 웹훅 복구는 모두 `merchantUid`로 결제 행을 `FOR UPDATE` 잠근 뒤 `READY → PAID`를 한 번만 수행해요. 먼저 도착한 경로가 완료하고, 나중 경로는 이미 `PAID`인 것을 확인해 예약금 플래그만 보정해요.

자동 복구 조건은 네 가지를 모두 만족해야 해요.

- PG 조회 결과가 실제 `PAID`
- PG 결제액과 서버가 만든 `payment.amount`가 일치
- 로컬 결제가 `READY` 또는 이미 `PAID`
- 예약이 아직 `PENDING` 또는 `CONFIRMED`

취소·거절·완료된 예약에서 뒤늦게 `PAID`가 확인되거나 금액이 다르면 예약을 되살리지 않아요. `payment_reconciliation_issue` 관리자 대사 큐에 남기고 자동 처리를 멈춰요.

### 예약 자동 만료 직전 재확인

`ReservationExpiryScheduler`는 만료 시각이 지났다는 이유만으로 바로 취소하지 않아요. 가장 최근 로컬 결제와 PortOne 권위 상태를 먼저 다시 확인해요.

| 확인 결과 | 동작 |
|---|---|
| PG `PAID` | 결제와 예약금 플래그 복구, 예약 보존 |
| PG `READY` · `FAILED` · `CANCELLED` | 로컬 결제를 `FAILED`로 닫고 예약 취소 허용 |
| PG 조회 실패 · 모르는 상태 | **예약 취소 보류**, 수동 대사 큐 기록 |
| 결제 행 자체가 없음 | 미결제 예약으로 취소 허용 |

PG 조회 실패는 fail-closed예요. 예약이 잠시 더 슬롯을 점유하는 비용보다 돈을 받은 예약을 취소하는 피해가 훨씬 크기 때문이에요.

후보 전체를 한 트랜잭션으로 묶지 않아요. 예약 한 건마다 독립 트랜잭션을 열고, 결제 행들을 먼저 잠근 뒤 예약 행을 잠가 최신 상태를 다시 읽어요. 한 건의 PG 조회 장애가 다른 후보를 롤백시키거나 잠금을 배치 끝까지 쥐지 않게 하려는 거예요.

## 결제 결과 화면

### 상태 조회 API

`GET /api/payment/status?type=reservation|ad&merchantUid=...`는 로그인한 본인의 DB 기록만 읽어요.

- 다른 사람의 주문과 없는 주문은 똑같이 404
- 응답은 `Cache-Control: no-store`, 구매자 PII 없음
- PG 결제·환불·재검증을 실행하지 않고 상태도 바꾸지 않아요

이 값은 **DB에 기록된 현재 상태**이지 별도의 PG 대사 증거가 아니에요.

### 완료 판정

프론트는 URL의 `success`, `error_msg`, `imp_uid`로 완료를 판정하지 않아요. 예약 `PAID`, 또는 광고 원장 `PAID`와 현재 광고 상태가 함께 확인될 때만 완료를 보여 주고, 나머지는 내역 확인으로 안내해요. 광고의 과거 UID·미이관 원장·환불 진행 중은 이전 `ACTIVE` 표시만으로 성공 처리하지 않아요.

| 서버 기록 | 화면 | 허용 행동 |
|---|---|---|
| 조회 요청 중 | `결제 처리 중` | 기다리기와 `결제창으로 이동하지 못하셨나요?` 내역 복귀 링크만 둬요. 같은 주문의 재결제·자동 재시도 버튼은 없어요 |
| 예약 `PAID` / 광고 `ACTIVE` | `결제 완료` | 내 예약 또는 광고 관리로 이동 |
| 예약 `FAILED`·`CANCELLED` / 광고 `PAYMENT_FAILED`·`CANCELLED` | 완료되지 않음 | 내역 화면으로 가서 그 화면의 기존 결제 가능 상태에서 다시 시작 |
| 조회 실패·`READY`·광고 `PENDING_PAYMENT` 등 미확정 | 상태 확인 | 읽기 전용 상태 재조회와 내역 이동만 |

외부 결제창에서 돌아왔을 때도 완료 확인 전에는 "다시 결제"를 바로 노출하지 않아요. `결제창으로 이동하지 못하셨나요?` 링크는 기존 결제 가능 상태로 돌아갈 뿐, 기존 주문번호의 PG 결제창을 다시 열지 않아요. 네트워크 오류·창 닫힘·PG 응답 지연 속에서 이미 결제됐을 가능성을 지키기 위해서예요.

광고 내역은 `/business?tab=ads`로 이동해서 새 문서·새로고침에서도 광고 탭이 열려요.

### 모바일 리다이렉트

모바일 `redirectUrl`은 프론트 결과 화면이 아니라 서버의 `/api/payment/mobile-redirect`를 가리켜요. 서버는 PortOne 결과를 기존 검증 관문에 통과시킨 뒤에만 `/payment/result`로 302 이동시켜요. 광고도 전용 모바일 리다이렉트와 원장 검증을 거쳐요.
[Toss Payments의 successUrl 처리 방식](https://docs.tosspayments.com/blog/what-is-successurl) 중 서버가 승인·검증을 마친 뒤 결과 화면으로 넘기는 형태와 같아요.

## 환불의 결말은 넷이에요

가장 중요한 개념이에요. 환불에는 성공·실패 말고 **"모른다"**가 있어요.

| PG 응답 | 뜻 | 우리가 하는 일 |
|---|---|---|
| `SUCCEEDED` | 돈이 실제로 돌아갔어요 | 결제를 `REFUNDED`/`PARTIAL_REFUNDED`로 확정 |
| `REQUESTED` | **접수만 됐어요.** 아직 환불이 아니에요 | 결제를 `REFUND_PENDING`으로 두고 결말을 기다려요 |
| `UNKNOWN` | 본문이 비었거나 모르는 값 | `REQUESTED`와 똑같이 다뤄요 — **낙관하지 않아요** |
| `FAILED` | PG가 거절했어요 | 원장에 실패로 닫고 사용자에게 알려요 |

예전에는 `PortoneService.cancelPayment`가 응답 본문을 `Void`로 버려서 HTTP 200이면 무조건 "환불 완료"로 적었어요. 그러면 `REQUESTED` 뒤 PG가 실패했을 때 **장부는 환불, 손님 돈은 그대로**가 돼요.

## 환불이 지나가는 길

```
refundByMemberRequest / refundByReservationCancel   ← 권한·정책 계산은 여기서
        ↓
refundPayment(PaymentRefundDto)
        ↓
① 결제 행을 FOR UPDATE 로 잠그고 읽는다      ← 이중 환불 방어의 핵심
② 상태 재확인 (PAID 만 통과, REFUND_PENDING 이면 409)
③ 금액 검증 (남은 환불 가능액 이하)
④ 원장에 REQUESTED 기록 + 즉시 커밋 (REQUIRES_NEW)  ← 여기서 죽어도 흔적이 남는다
⑤ PortOne 취소 호출
⑥ `SUCCEEDED`도 개별 실제 취소액이 요청액과 같을 때만 확정
⑦ 타임아웃·응답 유실·금액 불일치는 `REFUND_PENDING` + 원장·대사 큐
```

재발신을 막는 세 경계가 있어요. "PG에서는 돈이 나갔는데 로컬은 `PAID`라 다시 환불"되는 사고를 막아요.

1. `refund_attempt` 시작 행을 저장하지 못하면 ⑤의 PG 호출 자체를 보내지 않아요.
2. PG가 즉시 성공을 응답해도 원장은 먼저 `PENDING`으로 두고, 로컬 결제 트랜잭션이 커밋된 뒤에만 `SUCCEEDED`로 닫아요.
3. 로컬 커밋이 실패해 결제가 다시 `PAID`가 돼도 미결 원장이 남아 있으면 새 환불 요청을 거부해요.

PG 호출 응답을 잃은 경우도 실패로 닫지 않아요. 재시도를 허용하지 않고 `REFUND_PENDING`과 원장·대사 큐에 남겨요.

웹훅과 스케줄러가 같은 결말을 동시에 처리할 때도 결제 행을 다시 잠그고 **조회 당시의 기환불액**과 현재 누적액을 비교해요. 같은 결말의 멱등 재진입만 허용하고, 상태나 금액이 달라졌으면 원장을 닫지 않고 `REFUND_STATE_UNCERTAIN` 대사 건으로 남겨요.

### 왜 비관적 락인가

되돌릴 수 없는 일(PG에 취소를 실제로 보내는 것)이 **커밋보다 먼저** 일어나요. 낙관적 락(`@Version`)은 커밋 시점에 충돌을 알려 주니, 두 번째 요청도 **PG를 부른 뒤에야** 실패해요 — 이미 이중 환불이 나간 다음이죠. 행을 먼저 잠그면 두 번째 요청은 기다렸다가 바뀐 상태를 보고 **PG를 부르기 전에** 거절돼요.

`@Version` 컬럼을 안 만들어도 되는 것도 이점이에요. `ddl-auto: update`는 컬럼을 추가할 뿐 **기존 행을 0으로 채워 주지 않아서**, 옛 결제 행의 version이 NULL로 남아 수동 DDL이 필요해져요.

### 원장에 FK를 걸면 안 돼요 — 교착

`refund_attempt.payment_id`는 **FK가 아니라 그냥 값**이에요. 일부러 그렇게 뒀어요.

바깥 트랜잭션이 `payment` 행을 `FOR UPDATE`로 쥔 채 원장을 **별도 트랜잭션**에 넣어요. FK가 있으면 InnoDB가 참조 무결성 확인을 위해 부모 행(`payment`)에 공유 잠금을 거는데, 그 행은 바깥이 배타 잠금으로 쥐고 있어요. 바깥은 안쪽을, 안쪽은 바깥을 기다리는 **교착**이에요.

> 주의: H2 테스트로는 절대 못 잡아요(동시성을 재현하지 않고 잠금 동작도 달라요). 실제 환불을 시도하는 순간 처음 드러나는 종류의 문제예요.

DB 차원의 참조 무결성은 포기했지만, 이 원장의 목적이 "결제 쪽이 어떻게 되든 시도 기록은 남는다"라서 방향이 맞아요.

### 원장을 별도 트랜잭션에 쓰는 이유

같은 트랜잭션이면 환불이 실패해 롤백될 때 **실패했다는 기록까지 같이 사라져요.**

PG 호출 전에 프로세스가 죽으면 **원장은 REQUESTED인데 결제는 여전히 PAID**일 수 있어요. 정상 예외 경로에서는 `REFUND_PENDING`으로 잠그지만, 어느 경우든 원장과 로컬 상태의 불일치는 자동 재발신 근거가 아니라 **조회·대사가 필요한 신호**예요.

### 예약 행 잠금과 독립 환불

예약 취소·거절은 예약 행을 `FOR UPDATE`로 잠가요. 독립 환불(`REQUIRES_NEW`)에서 같은 예약을 UPDATE하면 자신의 바깥 잠금을 기다리다 timeout해요.

- 고객 취소·가게 거절·가게 취소의 내부 환불은 결제만 갱신하고, 전액 환불 확정이 반환된 뒤 잠금을 가진 호출자가 예약금을 정리해요.
- 직접 환불·웹훅·재조회는 결제와 예약금 표시를 함께 갱신해요.
- PG 성공/로컬 실패를 수동 SQL로 숨기거나 같은 PG 취소를 재발신하지 않아요.

## 미결 환불이 풀리는 두 경로

웹훅과 5분 재조회의 결말 판정은 `RefundSettlementPolicy` 한 곳에서 해요. PG 상태 문자열만으로 성공·실패를 확정하지 않고 누적 취소액·취소 ID·개별 취소 상태와 금액을 함께 대조해요.

### 1. 재조회 스케줄러 (5분마다)

`RefundReconciliationScheduler`가 2분 이상 된 미결 건을 PG에 **다시 물어봐요.**

> 주의: **취소를 다시 보내지 않아요.** 앞의 요청이 사실은 성공했을 수 있어서 재전송은 이중 환불 위험이에요. **상태만 읽어요.**

| PG 조회 근거 | 판정 |
|---|---|
| 이번 취소 ID가 `SUCCEEDED`, 개별 취소액=요청액, 누적 취소액=기확정액+요청액, 다른 미결 취소 없음 | 환불 성공 확정 |
| 이번 취소 ID가 명시적 `FAILED`, 누적 취소액 불변, 결제 상태도 기확정액과 일치 | 실패 확정 후 결제를 이전 상태로 되돌림 |
| 이번 취소가 `REQUESTED`/미상이고 누적 취소액 불변 | `REFUND_PENDING` 유지, 다음 회차 재조회 |
| 응답 유실로 취소 ID가 없지만 누적 취소액이 정확히 요청액만큼 증가했고 모든 취소가 종결·합계 일치 | 환불 성공 복구 |
| 취소 ID 없이 위 조건도 불충족, 금액 누락/불일치, 동시 미결, 상태 충돌 | 자동 변경 없이 `REFUND_STATE_UNCERTAIN` 대사 큐 |

`PAID`라는 이유만으로 실패를 추측하지 않아요. 한 결제에 로컬 미결 시도가 둘 이상이면 자동 판정을 멈추고 대사 큐에 남겨요. 필드 정의는 PortOne V2의 [`PaymentAmount`와 `PaymentCancellation`](https://developers.portone.io/api/rest-v2/payment?v=v2)을 따라요.

### 2. 웹훅 (`POST /api/payment/webhook/portone`)

PG가 직접 알려 주는 경로라 **브라우저와 무관해요.** 손님이 결제 직후 창을 닫아도 알 수 있어요. 이 경로가 없던 때는 결제는 됐는데 검증이 실패하면 스케줄러가 **환불 없이 예약만 자동 취소**했어요.

**웹훅 본문 값을 그대로 믿지 않아요.** 서명이 맞아도 본문은 "무엇이 바뀌었다"는 신호로만 쓰고, 실제 상태는 조회 API로 다시 물어봐요. 웹훅은 순서가 뒤바뀌어 도착할 수 있어요.

서명 검증을 통과한 웹훅은 처리 전에 `payment_webhook_inbox`에 먼저 커밋해요.

1. `webhook-id` unique 제약으로 중복 수신을 한 행으로 합쳐요
2. 원문은 저장하지 않고 이벤트 종류·`merchantUid`·payload SHA-256만 저장해요
3. PG 조회와 상태 반영에 실패하면 `FAILED`와 예외 **종류만** 남겨요
4. 1분 스케줄러가 지수 backoff(최대 60분)로 재처리해요
5. 처리 중 서버가 죽은 건은 5분 lease가 지난 뒤 다시 claim해요

payload SHA-256은 같은 `webhook-id`가 다른 본문으로 재사용되는 이상을 감지할 뿐, 관리자 API에는 노출하지 않아요. 실제 결제 판단에는 언제나 PortOne 조회 응답만 써요.

## 웹훅 보안 — 인증은 서명 하나뿐이에요

PG 서버가 부르므로 로그인 세션이 없어요(`SecurityConfig`에서 `permitAll`). 검증이 없으면 **아무나** "이 결제 취소됐어요"를 쏴서 예약을 취소시킬 수 있어요.

규격은 [Standard Webhooks](https://www.standardwebhooks.com/)예요.

- 헤더 `webhook-id` · `webhook-timestamp` · `webhook-signature`
- 서명 대상 문자열: **`{id}.{timestamp}.{본문}`**
- HMAC-SHA256 → base64, 헤더 값은 `v1,<base64>` (공백 구분 복수 가능 — 키 교체 기간)
- 시크릿은 `whsec_` + base64. **접두사를 떼고 디코딩한 바이트**가 키
- 시각 허용 범위 5분(재생 공격 방어), 서명 비교는 **상수 시간**

절대 하지 말 것 두 가지:

1. **본문을 DTO로 바인딩하지 않아요.** 서명은 원본 바이트로 계산돼요. 파싱했다 다시 직렬화하면 공백·키 순서가 달라져 **정상 요청도 전부 위조로 판정돼요.** 컨트롤러가 `@RequestBody String`을 쓰는 이유예요.
2. **시크릿이 없을 때 통과시키지 않아요.** 비어 있으면 전부 거부해요(fail-closed).

### 응답 코드가 곧 재전송 정책이에요

| 코드 | 뜻 |
|---|---|
| 2xx | 처리 완료. PortOne이 다시 보내지 않아요 |
| 4xx | 서명 실패. 다시 보내도 같으니 재전송 불필요 |
| 5xx | 우리 쪽 일시 장애. **재전송을 받고 싶을 때만** |

예외를 무조건 삼켜 200을 주면 일시 장애로 놓친 이벤트를 **영영 다시 받지 못해요.**

서명은 정상이어도 `merchantUid`에 대응하는 로컬 결제 행이 없으면 PortOne 호출 테스트나 다른 환경의 신호일 수 있어요. 이때는 PG 조회를 보내지 않고 inbox를 `IGNORED`로 닫아요. 로컬 결제 행이 있는데 PG 조회가 실패한 경우만 `FAILED`와 5xx로 남겨 재처리해요.

## 운영 — 미결 환불이 생겼을 때

### 확인

```bash
# 미결 건수 (0 이 정상)
GET /api/admin/refunds/unresolved-count

# 미결 목록
GET /api/admin/refunds?unresolvedOnly=true

# 특정 결제의 시도 이력 (대사용)
GET /api/admin/refunds/by-payment/{paymentId}
```

로그로도 볼 수 있어요.

```logql
{job="reserve"} |= `Refund stuck unresolved`
{job="reserve"} |= `multiple unresolved attempts`
```

### 대응 순서

1. **원장에서 `cancellationId`와 `merchantUid`를 확인해요**
2. **PortOne 콘솔에서 그 결제의 실제 상태를 봐요** — 이게 최종 권위예요
3. 취소가 완료돼 있으면 누적액·개별 취소 ID/금액·단일 원장이 일치할 때만 스케줄러가 확정해요. 로컬 커밋 실패로 `PAID`인 종료 예약도 정확한 원장 검증 뒤 복구해요. 진행 중 예약·취소 ID 미확정·복수 원장·금액 충돌은 대사 큐에 유지해요. PG 취소를 다시 보내지 않아요.
4. PG가 개별 취소를 명시적으로 `FAILED`로 확정하고 원장도 `FAILED`로 닫힌 경우에만 재시도를 검토해요. 돈이 아직 안 돌아왔거나 `REQUESTED`/`UNKNOWN`이라는 이유로 재취소하지 않아요.
5. `resolve_attempts`가 20을 넘도록 결말이 안 나면 ERROR 로그가 떠요 — **사람이 판단할 때예요**

> 주의: **원장은 읽기 전용이에요.** 손으로 고칠 수 있게 만드는 순간 장부가 아니게 돼요.

## 운영 — 결제 대사 큐와 웹훅 inbox

```bash
# 자동 만료 대상에서 벗어나 7일 넘게 READY인 결제 조회
GET /api/admin/payment-operations/stale-ready?olderThanDays=7&page=0&size=50

# 선택한 READY 결제를 PortOne에서 재조회해 안전한 경우만 정리
POST /api/admin/payment-operations/stale-ready/{paymentId}/reconcile

# 자동으로 단정하지 못한 결제 건수 (0이 정상)
GET /api/admin/payment-operations/issues/open-count

# 열린 결제 대사 건 목록
GET /api/admin/payment-operations/issues?openOnly=true&page=0&size=50

# 아직 끝나지 않은 웹훅 건수와 목록
GET /api/admin/payment-operations/webhooks/unfinished-count
GET /api/admin/payment-operations/webhooks?unfinishedOnly=true&page=0&size=50

# 선택한 inbox 건을 backoff 대기 없이 같은 멱등 관문으로 재처리
POST /api/admin/payment-operations/webhooks/{inboxId}/retry
```

대사 큐에는 PII와 PG 원문이 없고 원인 코드만 남아요.

| 원인 | 의미 |
|---|---|
| `EXPIRY_RECHECK_FAILED` | 예약 만료 직전 PortOne 조회 자체가 실패 |
| `EXPIRY_STATUS_UNCERTAIN` | 조회는 됐지만 자동 판정 대상이 아닌 PG 상태 |
| `LOCAL_STATUS_UNCERTAIN` | 로컬 결제 상태가 만료 처리 계약과 맞지 않음 |
| `STALE_READY_RECHECK_FAILED` | 오래된 READY 결제의 PortOne 조회 자체가 실패 |
| `STALE_READY_STILL_PENDING` | PG도 아직 결제 대기 상태라 사람이 후속 판단해야 함 |
| `STALE_READY_STATUS_UNCERTAIN` | 조회는 됐지만 오래된 READY 자동 정리 대상이 아닌 PG 상태 |
| `LATE_PAID_RESERVATION` | 이미 취소·종료된 예약에서 PAID 확인 |
| `PAID_STATE_CONFLICT` | PG는 PAID지만 로컬 결제가 READY/PAID가 아님 |
| `PAID_AMOUNT_MISMATCH` | PG 결제액과 서버 결제액 불일치 |
| `REFUND_LEDGER_MISSING` | 로컬 결제는 환불 미결인데 대응하는 미결 원장 행이 없음 |
| `REFUND_STATE_UNCERTAIN` | PG 취소 ID·개별/누적 금액·상태 또는 처리 중 바뀐 로컬 상태가 서로 맞지 않음 |

같은 결제·같은 범주의 문제는 행을 늘리지 않고 `occurrenceCount`, `lastSeenAt`, 최신 원인 코드로 갱신해요. 결제가 안전하게 복구되거나 미결제가 확정되면 자동으로 `RESOLVED`가 돼요.

### 대응 순서

1. 큐에서 `merchantUid`, `paymentId`, `reservationId`, 원인 코드를 확인해요
2. PortOne 콘솔에서 `merchantUid`의 실제 결제·취소 상태와 금액을 확인해요
3. `LATE_PAID_RESERVATION`과 금액 불일치는 **예약 자동 복원이나 DB 직접 수정 금지**예요
4. 결제 유지·예약 복원 또는 전액 환불 중 무엇이 맞는지 예약 상태와 고객 안내를 함께 판단해요
5. 웹훅 전송 문제면 inbox 재처리를 실행하고 `PROCESSED` 또는 열린 대사 건을 다시 확인해요

관리자 패널 **결제 운영** 탭에서 오래된 READY·열린 대사 건·미완료 웹훅을 각각 서버측 페이지네이션으로 보고, 선택한 READY 재확인과 웹훅 재처리를 실행할 수 있어요.
셋 중 하나라도 있으면 15분마다 `Payment operations queue requires attention` 로그가 남아 Grafana 알림 조건으로 쓸 수 있어요.

배포 직후 구조와 큐를 한 번에 볼 때는 `scripts/verify-post-deploy-readonly.sh`를 써요. 오래된 READY의 payment/reservation ID까지만 보여 주고 PG 재조회나 상태 변경은 하지 않아요. 종료 코드 `2`는 배포 구조 실패가 아니라 운영자 확인 항목이 있다는 뜻이에요.

## 운영 설정

1. **PortOne 콘솔 웹훅 등록**
   - URL: `https://reserve.it.kr/api/payment/webhook/portone`
   - TEST 모드는 URL·시크릿이 등록돼 있고 `호출 테스트` 수신을 확인했어요
   - 실연동(LIVE) 모드는 비어 있어요. LIVE 전환 전에 TEST와 별도로 등록해야 해요
2. **`PORTONE_WEBHOOK_SECRET` 배선**
   - GitHub Secrets의 `PORTONE_WEBHOOK_SECRET`이 `CICD.yml`의 export 목록과 `docker-compose-blue/green.yml`의 environment를 거쳐 컨테이너로 전달돼요
   - 값이 없으면 웹훅이 전부 거부돼요(fail-closed). 앱은 정상 기동해요
3. **등록 후 테스트 결제 1건으로 확인**
   - `GET /api/admin/payment-operations/webhooks?unfinishedOnly=false`에 새 행이 생기는지
   - 최종 상태가 `PROCESSED`인지
   - 브라우저를 닫은 테스트에서도 로컬 결제와 예약금 플래그가 `PAID`로 복구되는지

> 주의: 배선이 빠져 있던 때는 시크릿을 등록해도 컨테이너에 안 들어가 웹훅이 전부 거부됐어요. 앱이 정상 기동해서 아무 에러도 안 나는 종류의 고장이에요.

## 아직 검증되지 않은 것

| 항목 | 상태 |
|---|---|
| 행 잠금의 실제 동작 | 운영 InnoDB의 비활성 TEST 행에서 대기·timeout·양쪽 rollback은 확인. 두 환불 요청과 PG 호출까지 포함한 E2E는 미검증 |
| PG 취소 응답 금액 필드 | `PaymentAmount.cancelled`와 `PaymentCancellation.totalAmount`를 DTO·정책에서 읽어요. 로컬 JSON 회귀만 통과했고 실제 TEST 취소 응답 대조는 미검증 |
| 웹훅 실제 수신 | synthetic 중복 멱등성과 콘솔 `호출 테스트` 도착·서명 검증은 확인. 실제 TEST 결제 이벤트는 미검증 |
| PAID 웹훅 복구·만료 재확인 실기 | Mockito/H2 회귀만 통과. 실제 TEST 웹훅 중복·브라우저 종료·일시 장애 조합은 미실행 |
| LIVE 채널 | 전부 TEST 원장이에요 |

## LIVE 전환 전 체크리스트

- [ ] 위 "아직 검증되지 않은 것" 항목을 전부 닫는다
- [x] PortOne TEST 콘솔 URL·시크릿 등록과 `호출 테스트` 실제 수신 확인
- [ ] 실제 TEST 결제로 결제 이벤트 수신 확인
- [x] 운영 MySQL에서 `payment_webhook_inbox`, `payment_reconciliation_issue` 테이블과 unique/index 확인
- [x] synthetic 서명 요청을 같은 `webhook-id`로 2회 전송해 inbox가 한 행만 생기는지 확인
- [ ] 결제 직후 브라우저를 닫아도 웹훅으로 `PAID`와 예약금 플래그가 복구되는지 확인
- [ ] PortOne 조회 장애를 모의해 예약 취소가 보류되고 대사 큐에 남는지 확인
- [ ] MySQL 에서 동시 환불 2건을 실제로 쏴서 **한 건만 나가는지** 확인
- [ ] 미결 건 알림(아래) 등록
- [ ] 전액 환불 · 부분 환불 · 실패 각각 1회씩 실제로 돌려본다

### 걸어둘 알림

[모니터링](monitoring.md)의 알림 규칙에 함께 둬요.

```logql
sum(count_over_time({job="reserve"} |= `Refund stuck unresolved` [1h]))
```

조건은 **ABOVE 0**이에요. 이 알림이 울리면 자동 해소에 실패한 돈 건이 있다는 뜻이에요 — 사람을 깨울 이유가 가장 확실한 신호예요.
