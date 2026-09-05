# 결제 · 환불

> PortOne V2 (구 아임포트) + KakaoPay. **채널은 아직 `TEST` 다** — 실제 돈이 오가지 않는다.
> LIVE 전환 전 체크리스트는 맨 아래.

---

## 왜 이 문서가 따로 있나

이 프로젝트에서 되돌릴 수 없는 일은 **돈이 움직이는 것** 하나뿐이다.
화면이 깨지면 고치면 되고 로그가 사라지면 다시 쌓으면 되지만, 잘못 나간 환불은 되돌릴 수 없다.
그래서 환불 경로만은 **"무엇을 시도했고 어떻게 끝났는지"가 항상 데이터로 남아야** 한다.

같은 원칙을 결제 성립에도 적용한다. 브라우저가 결제 뒤 돌아오지 않거나 PG 조회가 잠시 실패해도
"결제됐을 가능성이 있는 예약"을 미결제라고 단정해 취소하면 안 된다.

결제·환불 미결 건이 회원 탈퇴와 가게 영업 종료를 어떻게 막는지는
[`data-lifecycle.md`](data-lifecycle.md)에 정리한다.

---

## 결제 성립 — 브라우저와 웹훅이 같은 잠금 관문을 쓴다

`PaymentService`의 브라우저 검증과 PortOne 웹훅 복구는 모두 `merchantUid`로 결제 행을
`FOR UPDATE` 잠근 뒤 `READY → PAID`를 한 번만 수행한다. 먼저 도착한 경로가 완료하고,
나중 경로는 이미 `PAID`인 것을 확인해 예약금 플래그만 보정한다.

자동 복구 조건은 엄격하다.

- PG 조회 결과가 실제 `PAID`
- PG 결제액과 서버가 만든 `payment.amount`가 일치
- 로컬 결제가 `READY` 또는 이미 `PAID`
- 예약이 아직 `PENDING` 또는 `CONFIRMED`

취소·거절·완료된 예약에서 뒤늦게 `PAID`가 확인되거나 금액이 다르면 예약을 임의로 되살리지 않는다.
해당 건은 `payment_reconciliation_issue`의 관리자 대사 큐에 남기고 자동 처리를 멈춘다.

### 예약 자동 만료 직전 재확인

`ReservationExpiryScheduler`는 만료 시각이 지났다는 이유만으로 바로 취소하지 않는다.
먼저 가장 최근 로컬 결제와 PortOne 권위 상태를 다시 확인한다.

| 확인 결과 | 동작 |
|---|---|
| PG `PAID` | 결제와 예약금 플래그 복구, 예약 보존 |
| PG `READY` · `FAILED` · `CANCELLED` | 로컬 결제를 `FAILED`로 닫고 예약 취소 허용 |
| PG 조회 실패 · 모르는 상태 | **예약 취소 보류**, 수동 대사 큐 기록 |
| 결제 행 자체가 없음 | 미결제 예약으로 취소 허용 |

PG 조회 실패는 fail-closed다. 일시 장애 때 예약이 잠시 더 슬롯을 점유하는 비용보다
돈을 받은 예약을 취소하는 피해가 훨씬 크기 때문이다.

후보 전체를 한 트랜잭션으로 묶지 않는다. 예약 한 건마다 독립 트랜잭션을 열고,
결제 행들을 먼저 잠근 뒤 예약 행을 잠가 최신 상태를 다시 읽는다. 한 PG 조회 장애가
다른 후보를 롤백시키거나 첫 결제 잠금을 배치 끝까지 유지하지 않게 하기 위해서다.

---

## ★ 환불의 결말은 셋이 아니라 넷이다

가장 중요한 개념이다. 환불에는 성공·실패 말고 **"모른다"** 가 있다.

| PG 응답 | 뜻 | 우리가 하는 일 |
|---|---|---|
| `SUCCEEDED` | 돈이 실제로 돌아갔다 | 결제를 `REFUNDED`/`PARTIAL_REFUNDED` 로 확정 |
| `REQUESTED` | **접수만 됐다.** 아직 환불이 아니다 | 결제를 `REFUND_PENDING` 으로 두고 결말을 기다린다 |
| `UNKNOWN` | 본문이 비었거나 모르는 값 | `REQUESTED` 와 똑같이 다룬다 — **낙관하지 않는다** |
| `FAILED` | PG 가 거절했다 | 원장에 실패로 닫고 사용자에게 알린다 |

**예전에는 이 구분이 아예 없었다.** `PortoneService.cancelPayment` 가 응답 본문을 `Void` 로 버려서,
HTTP 200 만 오면 무조건 "환불 완료"로 적었다. `REQUESTED` 뒤에 PG 가 실패하면
**장부는 환불, 손님 돈은 그대로** — 가장 나쁜 어긋남이 생긴다.

---

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
⑥ 응답 상태에 따라 분기 (위 표)
```

### ① 왜 비관적 락인가 — 낙관적 락(@Version)으로는 못 막는다

되돌릴 수 없는 일(= PG 에 취소를 실제로 보내는 것)이 **커밋보다 먼저** 일어난다.
낙관적 락은 커밋 시점에 충돌을 알려주므로, 두 번째 요청도 **PG 를 부른 뒤에야** 실패한다 —
이미 이중 환불이 나간 다음이다. 행을 먼저 잠그면 두 번째 요청은 기다렸다가
바뀐 상태를 보고 **PG 를 부르기 전에** 거절된다.

덤으로 `@Version` 컬럼을 안 만들어도 된다. `ddl-auto: update` 는 컬럼을 추가해줄 뿐
**기존 행을 0 으로 채워주지 않아서**, 옛 결제 행의 version 이 NULL 로 남아 수동 DDL 이 필요해진다.

### ★ 원장에 FK 를 걸면 안 된다 — 교착

`refund_attempt.payment_id` 는 **FK 가 아니라 그냥 값**이다. 일부러 그렇게 뒀다.

바깥 트랜잭션이 `payment` 행을 `FOR UPDATE` 로 쥔 상태에서, 원장을 **별도 트랜잭션**에 넣는다.
이때 FK 가 있으면 InnoDB 가 참조 무결성 확인을 위해 **부모 행(payment)에 공유 잠금**을 건다.
그 행은 바깥이 배타 잠금으로 쥐고 있으니 — 바깥은 안쪽을 기다리고 안쪽은 바깥을 기다린다. **교착.**

H2 테스트로는 절대 못 잡는다(동시성을 재현하지 않고 잠금 동작도 다르다).
**실제 환불을 시도하는 순간, 즉 손님 돈이 걸린 그때** 처음 드러났을 문제다.

DB 차원의 참조 무결성은 포기했지만, 어차피 이 원장의 목적이
"결제 쪽이 어떻게 되든 시도 기록은 남는다" 라서 방향이 맞다.

### ④ 왜 원장을 별도 트랜잭션에 쓰나

같은 트랜잭션이면 환불이 실패해 롤백될 때 **"실패했다는 기록까지 같이 사라진다."**
기록이 가장 필요한 순간에 기록이 없어지는 셈이다.

그래서 이런 그림이 나올 수 있다 — **원장에는 REQUESTED 인데 결제는 여전히 PAID.**
이건 버그가 아니라 **신호**다. "PG 를 부르다 끊겼으니 사람이 콘솔에서 확인하라"는 뜻이다.

---

## 미결 건은 어떻게 해소되나 — 두 경로

### 1. 재조회 스케줄러 (5분마다)

`RefundReconciliationScheduler` 가 2분 이상 된 미결 건을 PG 에 **다시 물어본다.**

> **취소를 다시 보내지 않는다.** 앞의 요청이 사실은 성공했을 수 있어서 재전송은 이중 환불 위험이다.
> **상태만 읽는다.**

| PG 결제 상태 | 판정 |
|---|---|
| `CANCELLED` · `PARTIAL_CANCELLED` | 환불 성공 확정 |
| `PAID` | 취소가 반영 안 됨 → 실패 확정, 결제를 `PAID` 로 되돌림 |
| 그 외 | 아직 판단하지 않음. 다음 회차에 다시 본다 |

**한계 (알고 감수함)**: 결제 **상태값**만 보므로, 한 결제에 미결 시도가 둘 이상이면
어느 것이 끝났는지 구분하지 못한다. 그 경우는 건드리지 않고 ERROR 로그만 남긴다 —
잘못 확정하는 것보다 미결로 두는 편이 낫다.

### 2. 웹훅 (`POST /api/payment/webhook/portone`)

PG 가 직접 알려주는 경로. **브라우저와 무관하다** — 손님이 결제 직후 창을 닫아도 우리는 알 수 있다.

> 예전에는 이게 없어서, 결제는 됐는데 검증이 실패하면
> 스케줄러가 **환불 없이 예약만 자동 취소**했다. 돈은 받고 예약은 없애는 최악의 경우다.

**웹훅 본문의 값을 그대로 믿지 않는다.** 서명이 맞아도 본문은 "무엇이 바뀌었다"는 신호로만 쓰고,
실제 상태는 조회 API 로 **우리가 다시 물어본다.** 웹훅은 순서가 뒤바뀌어 도착할 수 있기 때문이다.

서명 검증을 통과한 웹훅은 처리 전에 `payment_webhook_inbox`에 먼저 커밋한다.

1. `webhook-id` unique 제약으로 중복 수신을 한 행으로 합친다
2. 원문은 저장하지 않고 이벤트 종류·`merchantUid`·payload SHA-256만 저장한다
3. PG 조회와 상태 반영에 실패하면 `FAILED`와 예외 **종류만** 남긴다
4. 1분 스케줄러가 지수 backoff(최대 60분)로 재처리한다
5. 처리 중 서버가 죽은 건 5분 lease가 지난 뒤 다시 claim한다

payload SHA-256은 같은 `webhook-id`가 다른 본문으로 재사용되는 이상을 감지할 뿐,
관리자 API에는 노출하지 않는다. 실제 결제 판단에는 언제나 PortOne 조회 응답만 쓴다.

---

## 웹훅 보안 — 이 엔드포인트의 인증은 서명 하나뿐이다

PG 서버가 부르므로 로그인 세션이 없다(`SecurityConfig` 에서 `permitAll`).
검증이 없으면 **아무나** "이 결제 취소됐어요" 를 쏴서 예약을 취소시킬 수 있다.

규격은 [Standard Webhooks](https://www.standardwebhooks.com/):

- 헤더 `webhook-id` · `webhook-timestamp` · `webhook-signature`
- 서명 대상 문자열: **`{id}.{timestamp}.{본문}`**
- HMAC-SHA256 → base64, 헤더 값은 `v1,<base64>` (공백 구분 복수 가능 — 키 교체 기간)
- 시크릿은 `whsec_` + base64. **접두사를 떼고 디코딩한 바이트**가 키
- 5분 시각 허용 범위 (재생 공격 방어), 서명 비교는 **상수 시간**

**절대 하지 말 것 두 가지**

1. **본문을 DTO 로 바인딩하지 말 것.** 서명은 원본 바이트에 대해 계산된다.
   파싱했다 다시 직렬화하면 공백·키 순서가 달라져 **정상 요청도 전부 위조로 판정된다.**
   컨트롤러가 `@RequestBody String` 을 쓰는 이유다.
2. **시크릿이 없을 때 통과시키지 말 것.** 비어 있으면 전부 거부한다(fail-closed).

### 응답 코드가 곧 재전송 정책이다

| 코드 | 뜻 |
|---|---|
| 2xx | 처리 완료. PortOne 이 다시 보내지 않는다 |
| 4xx | 서명 실패. 다시 보내도 같으므로 재전송 불필요 |
| 5xx | 우리 쪽 일시 장애. **재전송을 받고 싶을 때만** |

예외를 무조건 삼켜 200 을 주면, 일시 장애로 놓친 이벤트를 **영영 다시 받지 못한다.**

---

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

로그로도 볼 수 있다:

```logql
{job="reserve"} |= `Refund stuck unresolved`
{job="reserve"} |= `multiple unresolved attempts`
```

### 대응 순서

1. **원장에서 `cancellationId` 와 `merchantUid` 를 확인한다**
2. **PortOne 콘솔에서 그 결제를 찾아 실제 상태를 본다** — 이게 최종 권위다
3. 콘솔에서 취소가 완료돼 있으면 → 스케줄러가 다음 회차에 알아서 확정한다(기다린다)
4. 콘솔에서 취소가 안 돼 있으면 → 스케줄러가 `PAID` 로 되돌린 뒤 다시 환불을 시도한다
5. `resolve_attempts` 가 20 을 넘도록 결말이 안 나면 ERROR 로그가 뜬다 — **사람이 판단할 때다**

> **원장은 읽기 전용이다.** 손으로 고칠 수 있게 만들면 그 순간 장부가 아니게 된다.

---

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

대사 큐에는 PII와 PG 원문이 없고 다음 원인 코드만 남는다.

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

동일 결제·동일 범주의 문제는 행을 무한히 늘리지 않고 `occurrenceCount`, `lastSeenAt`,
최신 원인 코드로 갱신한다. 결제가 안전하게 복구되거나 미결제가 확정되면 자동으로 `RESOLVED`가 된다.

### 대응 순서

1. 큐에서 `merchantUid`, `paymentId`, `reservationId`, 원인 코드를 확인한다
2. PortOne 콘솔에서 `merchantUid`의 실제 결제·취소 상태와 금액을 확인한다
3. `LATE_PAID_RESERVATION`과 금액 불일치는 **예약 자동 복원이나 DB 직접 수정 금지**
4. 결제 유지·예약 복원 또는 전액 환불 중 어떤 조치가 맞는지 예약 상태와 고객 안내를 함께 판단한다
5. 웹훅 전송 문제면 inbox 재처리를 실행하고 `PROCESSED` 또는 열린 대사 건을 다시 확인한다

관리자 패널의 **결제 운영** 탭에서 오래된 READY·열린 대사 건·미완료 웹훅을 각각
서버측 페이지네이션으로 조회하고, 선택한 READY 재확인과 웹훅 재처리를 실행할 수 있다.
열린 대사 건·실패 웹훅·7일 넘은 READY 중 하나라도 있으면 15분마다
`Payment operations queue requires attention` 로그가 남아 Grafana 알림 조건으로 쓸 수 있다.

배포 직후 구조와 큐를 한 번에 확인할 때는 `scripts/verify-post-deploy-readonly.sh`를 쓴다.
이 스크립트는 오래된 READY의 payment/reservation ID까지만 보여주며 PG 재조회나 상태 변경을
하지 않는다. 종료 코드 `2`는 배포 구조 실패가 아니라 운영자 확인 항목이 있다는 뜻이다.

---

## 사장님이 해야 할 설정 (아직 안 됨)

1. **PortOne 콘솔에서 웹훅 등록**
   - URL: `https://reserve.it.kr/api/payment/webhook/portone`
   - 시크릿 발급 → `whsec_...` 값 복사
2. **`PORTONE_WEBHOOK_SECRET` 등록**
   - GitHub Secrets 에 `PORTONE_WEBHOOK_SECRET` 추가 → **그 다음 배포 한 번**이면 컨테이너까지 들어간다
   - 배선은 이미 되어 있다(2026-08-23 추가): `CICD.yml` 의 export 목록 + `docker-compose-blue/green.yml` 의 environment.
     ★ 이 배선이 없던 동안에는 **시크릿을 등록해도 컨테이너에 안 들어가서 웹훅이 전부 거부**됐다 —
     앱이 정상 기동하기 때문에 아무 에러도 안 나는 종류의 고장이다
   - 값이 없으면 웹훅이 전부 거부된다(fail-closed). 앱은 정상 기동한다
3. **등록 후 테스트 결제 1건으로 확인**
   - `GET /api/admin/payment-operations/webhooks?unfinishedOnly=false`에 새 행이 생기는지
   - 최종 상태가 `PROCESSED`인지
   - 브라우저를 닫은 테스트에서도 로컬 결제와 예약금 플래그가 `PAID`로 복구되는지

---

## 아직 검증되지 않은 것 — 반드시 읽을 것

| 항목 | 상태 |
|---|---|
| **행 잠금의 실제 동작** | H2 에서 쿼리가 실행되는 것만 확인했다. **MySQL InnoDB 의 실제 잠금은 미검증** — 동시 요청 두 개로 실기 확인 필요 |
| **PG 취소 응답 금액 필드** | 응답의 금액 필드 구성을 문서로 확정하지 못해 **읽지 않는다.** 대신 원장의 `requestedAmount` 를 쓴다. 대사는 콘솔에서 |
| **웹훅 실제 수신** | 시크릿 미등록이라 아직 한 번도 받아본 적 없다 |
| **durable inbox·대사 큐의 운영 MySQL 구조** | H2에서 엔티티 생성과 잠금·페이지·재시도 쿼리만 확인했다. `ddl-auto: update`로 운영 재시작 시 테이블이 생긴 뒤 unique/index를 직접 확인해야 한다 |
| **PAID 웹훅 복구·만료 재확인 실기** | Mockito/H2 회귀는 통과했지만 실제 PortOne TEST 웹훅 중복·브라우저 종료·일시 장애 조합은 아직 실행하지 않았다 |
| **LIVE 채널** | 전부 TEST 원장이다 |

---

## LIVE 전환 전 체크리스트

- [ ] 위 "아직 검증되지 않은 것" 항목을 전부 닫는다
- [ ] 웹훅 등록 + 테스트 결제로 수신 확인
- [ ] 운영 MySQL에서 `payment_webhook_inbox`, `payment_reconciliation_issue` 테이블과 unique/index 확인
- [ ] 같은 `webhook-id` 2회 전송 시 결제가 한 번만 반영되는지 확인
- [ ] 결제 직후 브라우저를 닫아도 웹훅으로 `PAID`와 예약금 플래그가 복구되는지 확인
- [ ] PortOne 조회 장애를 모의해 예약 취소가 보류되고 대사 큐에 남는지 확인
- [ ] MySQL 에서 동시 환불 2건을 실제로 쏴서 **한 건만 나가는지** 확인
- [ ] 미결 건 알림(아래) 등록
- [ ] 전액 환불 · 부분 환불 · 실패 각각 1회씩 실제로 돌려본다

### 걸어둘 알림

`docs/technical/monitoring.md` 의 알림 규칙에 함께 둘 것:

```logql
sum(count_over_time({job="reserve"} |= `Refund stuck unresolved` [1h]))
```

**ABOVE 0.** 이 알림이 울린다는 건 자동 해소에 실패한 돈 건이 있다는 뜻이다 —
이 프로젝트에서 사람을 깨울 이유가 가장 확실한 신호다.
