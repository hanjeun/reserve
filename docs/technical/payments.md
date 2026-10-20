# 결제 · 환불

PortOne V2 + 카카오페이 예약 결제가 확정되고, 환불되고, 어긋난 건을 대사하는 방식을 정리해요.

광고 결제는 별도 원장과 상태기계를 써요. [광고 결제 런북](ad-payments.md)을 보세요. 미결 결제·환불이 탈퇴와 영업 종료를 막는 규칙은 [데이터 생명주기](data-lifecycle.md)에 있어요.

## 가게 정책 수정과 기존 예약 보호

v2.11.0의 등록·수정은 예약 접수 규칙, 노쇼 예약금·결제, 취소·환불 정책을 각각 묻고 실제 사용하는 필드만 검사해요. 무료 예약은 나중 결제를 끄며 예약금·결제 마감·환불 기준을 필수로 요구하지 않아요. 수정 요청에서 누락한 운영 기간·휴무·예약 인원은 유지하고, 명시적인 빈 값은 해제로 처리해요.

결제 준비 금액은 예약 당시 저장한 `depositAmount`가 우선이에요. **0원도 확정된 금액**이며 나중에 바뀐 가게 예약금을 대신 청구하지 않아요. 값이 없는 이전 예약에만 기존 폴백을 사용해요. 환불 기준은 아직 예약별로 저장하지 않으므로 가게 행 잠금 아래에서 남아 있는 유료 예약, 미처리 예약금, 미래 예약의 양수 `PAID` 기록을 확인해요. 실제 환불 조건을 바꾸는 수정은 409로 거절하고 기존 정책 유지·무료 예약·다른 항목 수정은 허용해요. 예약별 정책 스냅샷을 도입하려면 별도 스키마·기존 행 이행·복구 검증이 필요해요.

## 노쇼 예약금 입력 정책

2026-10-11 승인한 로컬 후속 변경은 가게 등록·수정의 노쇼 예약금을 **0~100,000원**으로 통일해요. 가입 질문과 기존 가게 입력 검증의 10만 원 상한에 서버 `StoreService`의 공통 저장 관문을 맞췄어요. 범위를 벗어나면 400 응답으로 거절하며 금액을 조용히 줄이지 않아요. 등록의 `null`은 기존처럼 0원으로 처리하고, 부분 수정에서 예약금을 보내지 않으면 기존 값을 유지해요.

이 변경은 `local-preview-all-changes`의 미커밋 구현이며 운영 적용·검사 완료를 뜻하지 않아요. 기존 예약·결제·환불 금액을 다시 쓰거나 실제 PG 결제를 실행하지 않아요. 배포 준비 때 등록·수정의 0원·10만 원 경계와 초과 거절, 기존 예약금 원장 보존을 함께 확인해요.

## 결제 성립

브라우저 검증과 PortOne 웹훅은 같은 관문을 지나요. `PaymentService`가 `merchantUid`로 결제 행을 `FOR UPDATE` 잠근 뒤 `READY → PAID`를 한 번만 수행해요. 나중에 온 경로는 이미 `PAID`인 것을 확인하고 예약금 플래그만 맞춰요.

자동 복구는 아래 네 조건을 모두 만족할 때만 해요.

- PG 조회 결과가 `PAID`
- PG 결제액 = 서버가 만든 `payment.amount`
- 로컬 결제가 `READY` 또는 `PAID`
- 예약이 `PENDING` 또는 `CONFIRMED`

그 밖(취소·거절·완료된 예약의 늦은 `PAID`, 금액 불일치)은 예약을 되살리지 않고 `payment_reconciliation_issue` 대사 큐에 남겨요.

### 브라우저 검증의 PG 호출 분리 — v2.13.0

`PaymentVerificationService`는 외부 트랜잭션 안에서 실행되는 것을 `NEVER`로 거절해요. `PaymentService.prepareVerification`의 짧은 읽기 트랜잭션에서 소유권·상태를 먼저 확인하고, 이미 완료된 결제는 PG를 다시 조회하지 않아요. PortOne 조회는 DB 트랜잭션 밖에서 실행해요. 그 뒤 `completeReadyPaymentFromPg`의 새 트랜잭션에서 결제·예약을 잠그고 상태·금액을 다시 확인해 웹훅·환불과의 경합을 처리해요. 모바일 복귀도 같은 순서를 사용해요.

이 검증 경로는 v2.13.0에 반영됐어요. 소유권 확인 순서·PG 호출 시 트랜잭션 부재·외부 트랜잭션 거절·완료/비소유 결제의 PG 미호출과 모바일 복귀 개인정보 경계는 격리 표적 검사로 확인했어요. 실제 PG 결제·환불 시험을 뜻하지 않아요.

### 환불·만료·오래된 READY의 PG 분리 — 로컬 후속 구현

후속 코드는 환불 발신과 만료·관리자 재조회도 트랜잭션 밖에서 수행해요. PG를 호출하는 `PaymentService` 진입점은 외부 트랜잭션을 `NEVER`로 거절하고, 준비·선점·결말만 각각 짧은 트랜잭션에 둬요. 이 후속 변경의 검사·배포 결과는 별도 확인 대상이에요. 운영 v2.13.0에 이 구현이 이미 배포됐다는 뜻은 아니에요.

### 예약 자동 만료 직전 재확인

자동 만료는 `ReservationExpiryProcessor`가 **PENDING · 미결제 · 양수 예약금 · 나중 결제 미허용** 조건을 모두 만족할 때만 적용해요. 제한 시간은 `paymentTimeoutMinutes`가 비어 있으면 30분이고, 0 이하이면 제한 없음이에요. 예약 신청 시각부터 양수 제한 시간이 지난 예약만 후보가 돼요. 나중 결제를 허용하거나 제한 없음으로 설정한 예약은 미결제만으로 자동 취소하지 않아요. 무료·결제 완료·확정 예약도 이 자동 만료 대상이 아니에요. 가입 질문의 필드 표시·필수 검증, 등록 요약과 실제 상세 미리보기, 결제 안내는 이 서버 정책과 맞춰요.

`ReservationExpiryScheduler`는 만료된 예약을 취소하기 전에 최근 로컬 결제와 PortOne 상태를 다시 확인해요.

| 확인 결과 | 동작 |
|---|---|
| PG `PAID` | 결제와 예약금 플래그 복구, 예약 보존 |
| PG `READY` · `FAILED` · `CANCELLED` | 로컬 결제를 `FAILED`로 닫고 예약 취소 |
| PG 조회 실패 · 모르는 상태 | 예약 취소 보류, 대사 큐 기록 |
| 결제 행 없음 | 미결제 예약으로 취소 |

후속 구현은 후보를 짧게 읽고 PG를 관측한 뒤, 새 트랜잭션에서 결제자·가게 소유자·외부 요청자의 회원 ID 오름차순 → 예약 단일 행 → 결제 행 순으로 잠가요. 금융 전용 예약 조회는 가게·소유자까지 함께 잠그는 일반 QR 조회와 분리해요. 일반 승인·QR·완료 경로도 기존 JOIN 잠금 전에 동일한 회원 정렬·예약 관문을 통과해 잠금 역순을 만들지 않아요. 결제 ID·주문번호에서 예약 ID와 회원 ID를 scalar로만 찾고 회원·예약을 먼저 잠그므로, 결제가 0행인 범위의 gap lock을 먼저 얻지 않아요. 회원 잠금 대기 전 열린 RR snapshot에 의존하지 않도록 READY 재사용과 환불 원장 검사는 current-read 잠금 목록을 사용해요. 최신 후보 조건과 관측한 결제 ID를 다시 확인하고 결제 판정·예약 취소를 함께 커밋해요. 관측 중 새 결제가 준비됐거나 가게 승인·결제 완료가 반영되면 옛 결과로 취소하지 않아요. 결제창 준비도 같은 잠금 순서로 예약 종료 여부를 확인해, 취소 결정 뒤 새 READY가 붙는 경합을 막아요.

## 결제 결과 화면

### 상태 조회 API

`GET /api/payment/status?type=reservation|ad&merchantUid=...`는 로그인한 본인의 DB 기록만 읽어요.

- 다른 사람의 주문과 없는 주문은 똑같이 404
- `Cache-Control: no-store`, 구매자 PII 없음
- PG 호출·상태 변경 없음

### 완료 판정

프론트는 URL의 `success`, `error_msg`, `imp_uid`로 완료를 판정하지 않아요. 서버 기록으로만 판정해요.

| 서버 기록 | 화면 | 허용 행동 |
|---|---|---|
| 조회 요청 중 | `결제 처리 중` | 기다리기, `결제창으로 이동하지 못하셨나요?` 내역 복귀 링크 |
| 예약 `PAID` / 광고 `ACTIVE` | `결제 완료` | 내 예약 또는 광고 관리로 이동 |
| 예약 `FAILED`·`CANCELLED` / 광고 `PAYMENT_FAILED`·`CANCELLED` | 완료되지 않음 | 내역 화면에서 다시 시작 |
| 조회 실패·`READY`·광고 `PENDING_PAYMENT` 등 | 상태 확인 | 상태 재조회, 내역 이동 |

- 광고 완료는 광고 원장 `PAID`와 현재 광고 상태가 함께 확인될 때만 보여 줘요.
- 같은 주문의 재결제·자동 재시도 버튼은 없어요. 복귀 링크는 기존 PG 결제창을 다시 열지 않아요.
- 광고 내역 이동 경로는 `/business?tab=ads`예요.

### 모바일 리다이렉트

모바일 `redirectUrl`은 서버의 `/api/payment/mobile-redirect`를 가리켜요. 서버가 PortOne 결과를 검증 관문에 통과시킨 뒤 `/payment/result`로 302 이동시켜요. 광고도 전용 모바일 리다이렉트를 거쳐요.

## 환불의 결말

| PG 응답 | 뜻 | 처리 |
|---|---|---|
| `SUCCEEDED` | 환불 완료 | 결제를 `REFUNDED`/`PARTIAL_REFUNDED`로 확정 |
| `REQUESTED` | 접수만 됨 | 결제를 `REFUND_PENDING`으로 두고 결말을 기다림 |
| `UNKNOWN` | 본문이 비었거나 모르는 값 | `REQUESTED`와 같게 처리 |
| `FAILED` | PG 거절 | 원장을 실패로 닫고 사용자에게 알림 |

## 환불 흐름

후속 구현의 순서는 다음과 같아요.

```
① 예약 행 → 결제 행 잠금, 소유권·예약 결정·정책·남은 환불액 확인
② 예약 취소/거절 + 결제 REFUND_PENDING + 원장 REQUESTED(미발신 표식)를 함께 커밋
③ 커밋 뒤 원장 ID로 발신 선점: REQUESTED/미발신 → PENDING/발신 시작을 먼저 커밋
④ 선점한 호출자만 DB 트랜잭션 밖에서 PortOne 취소 호출
⑤ 새 트랜잭션에서 예약 → 결제 → 원장을 잠그고 같은 ID·금액·누적 환불액인지 재확인
⑥ 성공 금액이 요청액과 같을 때 결제·예약금·원장 결말을 함께 커밋
```

- 원장 의도 저장에 실패하거나 취소 결정이 롤백되면 PG를 호출하지 않아요.
- 취소 결정 커밋 뒤 프로세스가 멈춰도 미발신 의도가 남고, 스케줄러가 최초 발신을 회수해요.
- 발신 시작 커밋 뒤 멈춘 건은 실제 요청이 도달했는지 알 수 없으므로 자동 재발신하지 않아요. PG 조회·운영 대사로 해소해요.
- 네트워크 타임아웃·응답 유실·금액 불일치는 `REFUND_PENDING`과 대사 큐에 남겨요. PG 명시적 최종 거절일 때만 원장을 실패로 닫고 결제를 기환불액에 맞는 상태로 돌려요.
- 성공 뒤 로컬 커밋이 실패해도 이미 커밋한 pending 원장이 남아요. 웹훅과 재조회는 기존 `RefundSettlementPolicy` 판정과 잠금 재확인으로 복구해요. 과거 두 단계 커밋 때문에 결제만 `REFUNDED`/`PARTIAL_REFUNDED`이고 원장이 미결인 경우에도 저장한 개별 취소 ID·유일한 내구 원장·PG 누적액과 개별액이 모두 맞아야 원장만 종결해요. 같은 금액만으로 환불을 추정하지 않아요.
- PortOne에는 원장 ID로 고정한 `Idempotency-Key`를 보내요. [공식 규격](https://developers.portone.io/api/rest-v2/overview?v=v2)의 보장 기간은 현재 3시간이므로, 이 키만 믿고 미결 요청을 무조건 다시 보내지 않아요.
- [부분 취소 규격](https://developers.portone.io/opi/ko/integration/cancel/v2/readme)에 맞춰 요청액과 `currentCancellableAmount`를 구분해요. 예를 들어 남은 잔액 10,000원 중 3,000원 취소라면 각각 3,000원·10,000원을 보내요.

### 원장 저장 방식

- 새 미발신 의도는 예약 결정·결제 상태와 **동일 트랜잭션**에 저장해요. 웹훅·재조회가 확인한 성공·실패도 원장 ID·취소 ID·요청액을 다시 확인하고 결제·예약금·원장과 같은 트랜잭션에 반영해요. 재조회 횟수 같은 진단 기록만 독립 트랜잭션에 남겨요.
- 기존 상태와 컬럼을 사용해요. `REQUESTED` + `failure_reason=REFUND_READY_TO_DISPATCH`만 확실한 미발신이에요. 발신 선점은 `PENDING` + `REFUND_DISPATCH_STARTED`로 바꾸고 커밋해요.
- 과거 `REQUESTED` 중 이 표식이 없는 행은 미발신으로 추정하지 않아요. 기존처럼 PG 조회·대사만 해요.
- 이 표식은 ADMIN 전용 원장 응답에만 표시돼요. 일반 결제 응답이나 사용자 완료 알림에는 넣지 않아요.
- `refund_attempt.payment_id`는 기존의 값 참조와 인덱스를 유지해요. 새 FK·컬럼·상태 enum·운영 DDL은 추가하지 않아요.
- 이중 발신 방지는 결제 행 잠금과 내구 원장의 단일 선점으로 해요. 관리자 조회 화면은 계속 읽기 전용이에요.
- 회원 탈퇴와 금융 의도 쓰기도 결제자 회원 행으로 직렬화해요. 탈퇴는 회원 잠금 뒤 결제·원장을 JOIN한 current read로 미결을 다시 확인하므로, 이전 RR snapshot이 새 환불 의도를 놓치지 않아요. 거래 이력의 환불은 탈퇴한 결제자 행도 잠글 수 있지만 외부 요청자는 계속 활성 회원이어야 해요.
- 취소 ID 응답을 잃은 활성 `REFUND_PENDING`은 기존 정책대로 유일 원장·누적 증가액·종결된 전체 취소 합계가 정확할 때 복구해요. 이미 `PAID`나 환불 완료 상태에 남은 과거 결말 보정에는 저장된 정확한 개별 취소 ID가 추가로 필요해요.

### 예약 행 잠금과 환불

고객 취소·가게 거절·가게 취소·미승인 시간 경과는 공통 회원 → 예약 → 결제 순으로 잠그고, 예약 결정과 환불 의도를 같은 트랜잭션에 기록해요. `afterCommit`은 이미 저장한 원장 ID를 실행할 뿐이에요. 이전 트랜잭션 자원을 명시적으로 중단한 뒤 발신하므로 PG 대기 동안 예약 잠금을 잡지 않아요. PG가 실패해도 커밋한 취소·거절은 유지하고, 실제 환불이 확정될 때 결제와 예약금 표시를 함께 갱신해요. 예약 시간 경과 배치도 `ReservationElapsedProcessor`가 한 건씩 독립 트랜잭션으로 처리해요. 과거 미결 환불 원장 때문에 한 건이 보류되면 그 예약의 결정·의도만 롤백하고 다음 예약을 계속 처리해요.

## 미결 환불 해소

웹훅과 재조회의 결말 판정은 `RefundSettlementPolicy` 한 곳에서 해요. 누적 취소액·취소 ID·개별 취소 상태와 금액을 함께 대조해요. 필드 정의는 PortOne V2의 [`PaymentAmount`와 `PaymentCancellation`](https://developers.portone.io/api/rest-v2/payment?v=v2)을 따라요.

### 재조회 스케줄러

`RefundReconciliationScheduler`가 5분마다 2분 이상 된 확실한 미발신 작업을 최대 100개까지 최초 발신해요. 이미 발신한 미결 건은 PG 상태만 조회하며 취소를 다시 보내지 않아요. 선점하지 못한 미발신 표식은 응답 불명 건으로 오인해 종결하지 않아요.

| PG 조회 근거 | 판정 |
|---|---|
| 이번 취소 ID가 `SUCCEEDED`, 개별 취소액=요청액, 누적 취소액=기확정액+요청액, 다른 미결 취소 없음 | 환불 성공 확정 |
| 이번 취소 ID가 명시적 `FAILED`, 누적 취소액 불변, 결제 상태도 기확정액과 일치 | 실패 확정 후 결제를 이전 상태로 되돌림 |
| 이번 취소가 `REQUESTED`/미상이고 누적 취소액 불변 | `REFUND_PENDING` 유지, 다음 회차 재조회 |
| 취소 ID가 없지만 누적 취소액이 정확히 요청액만큼 증가했고 모든 취소가 종결·합계 일치 | 환불 성공 복구 |
| 위 조건 불충족, 금액 누락/불일치, 동시 미결, 상태 충돌 | 자동 변경 없이 `REFUND_STATE_UNCERTAIN` 대사 큐 |

한 결제에 로컬 미결 시도가 둘 이상이면 자동 판정을 멈추고 대사 큐에 남겨요.

### 웹훅

`POST /api/payment/webhook/portone`은 PG가 직접 알려 주는 경로예요. 본문은 변경 신호로만 쓰고, 실제 상태는 조회 API로 다시 확인해요.

서명을 통과한 웹훅은 처리 전에 `payment_webhook_inbox`에 먼저 커밋해요.

1. `webhook-id` unique 제약으로 중복 수신을 한 행으로 합쳐요
2. 원문 대신 이벤트 종류·`merchantUid`·payload SHA-256만 저장해요
3. PG 조회·상태 반영에 실패하면 `FAILED`와 예외 종류만 남겨요
4. 1분 스케줄러가 지수 backoff(최대 60분)로 재처리해요
5. 처리 중 멈춘 건은 5분 lease가 지나면 다시 claim해요

## 웹훅 서명

로그인 세션 없이 호출되므로(`permitAll`) 서명이 유일한 인증이에요. 규격은 [Standard Webhooks](https://www.standardwebhooks.com/)예요.

- 헤더 `webhook-id` · `webhook-timestamp` · `webhook-signature`
- 서명 대상 문자열: `{id}.{timestamp}.{본문}`
- HMAC-SHA256 → base64, 헤더 값은 `v1,<base64>` (공백 구분 복수 가능)
- 시크릿은 `whsec_` + base64. 접두사를 떼고 디코딩한 바이트가 키
- 시각 허용 범위 5분, 서명은 상수 시간 비교
- 본문은 `@RequestBody String` 원본 바이트로 검증해요
- 시크릿이 비어 있으면 전부 거부해요

| 응답 | 뜻 |
|---|---|
| 2xx | 처리 완료. 재전송 없음 |
| 4xx | 서명 실패. 재전송 없음 |
| 5xx | 일시 장애. 재전송 받음 |

`merchantUid`에 대응하는 로컬 결제 행이 없으면 PG 조회 없이 inbox를 `IGNORED`로 닫아요. 로컬 행이 있는데 PG 조회가 실패하면 `FAILED`와 5xx로 남겨 재처리해요.

## 설정

| 이름 | 용도 |
|---|---|
| `PORTONE_WEBHOOK_SECRET` | 웹훅 서명 검증 시크릿. GitHub Secrets → `CICD.yml` export → `docker-compose-blue/green.yml` environment로 전달 |

PortOne 콘솔 웹훅 URL은 `https://reserve.it.kr/api/payment/webhook/portone`이에요. TEST·LIVE 모드마다 따로 등록해요.

## 운영 — 미결 환불

```bash
# 미결 건수 (0 이 정상)
GET /api/admin/refunds/unresolved-count

# 미결 목록
GET /api/admin/refunds?unresolvedOnly=true

# 특정 결제의 시도 이력 (대사용)
GET /api/admin/refunds/by-payment/{paymentId}
```

```logql
{job="reserve"} |= `Refund stuck unresolved`
{job="reserve"} |= `multiple unresolved attempts`
```

알림 쿼리예요. 조건은 ABOVE 0이에요. 규칙은 [모니터링](monitoring.md)에 함께 둬요.

```logql
sum(count_over_time({job="reserve"} |= `Refund stuck unresolved` [1h]))
```

대응 순서:

1. 원장에서 `cancellationId`와 `merchantUid`를 확인해요
2. PortOne 콘솔에서 그 결제의 실제 상태를 봐요
3. 취소가 완료돼 있으면 스케줄러가 누적액·개별 취소·단일 원장이 일치할 때 확정해요. 불일치 건은 대사 큐에 남아요. PG 취소를 다시 보내지 않아요
4. PG가 개별 취소를 `FAILED`로 확정하고 원장도 `FAILED`로 닫힌 경우에만 재시도를 검토해요
5. `resolve_attempts`가 20을 넘으면 ERROR 로그가 나요. 사람이 판단해요

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

관리자 패널 **결제 운영** 탭에서 같은 목록을 보고 READY 재확인과 웹훅 재처리를 실행할 수 있어요.
`PaymentOperationsMonitorScheduler`는 15분마다 아래 다섯 지표를 집계하고,
하나라도 양수면 `Payment operations queue requires attention` ERROR 로그에 모두 남겨요.

| 지표 | 뜻 |
|---|---|
| `openIssues` | 열린 결제 대사 건 |
| `failedWebhooks` | FAILED 웹훅 inbox 건 |
| `staleReadyPayments` | 생성 후 7일 넘은 READY 결제 |
| `ledgerInvariantViolations` | 결제 상태·수납액·확정 환불액의 불변식 위반 |
| `depositInvariantViolations` | 예약금 플래그와 양수 확정 원장 존재 여부가 다른 예약 |

이 로그는 Grafana 알림의 입력이지 규칙 설치나 발송 성공의 증거는 아니에요.
두 불변식의 대상은 위 세 큐 목록에 나오지 않아요. 다른 세 지표가 0이어도 무시하지 않아요.

### 예약금 불변식 — 읽기 전용 조사

`depositInvariantViolations`는 `depositPaid`와 **양수 확정 잔액인 결제 행이 하나 이상 있는지**를
비교해요. 결제는 `paid_at`이 있고 PAID/PARTIAL_REFUNDED/REFUND_PENDING/REFUNDED인 행만
포함하며, 잔액은 `amount - COALESCE(refund_amount, 0)`이에요. 전체 행의 SUM이 양수인지로
판정을 바꾸지 않아요. 취소·숨김 예약도 포함하고, REFUND_PENDING은 기록된 확정 환불액만 차감해요.
불일치 건수는 돈이 잘못 움직였다는 결론이나 PG 실제 상태·원인을 뜻하지 않아요.

로컬 후속 후보에는 관리자 전용
`GET /api/admin/payment-operations/deposit-invariants?page=0&size=50`을 준비했어요.
**아직 dev 통합·운영 배포 전이므로 현재 운영에서 사용 가능하다고 가정하지 않아요.**
이 후보는 COUNT와 목록 조건을 공유하고, size 1~100의 페이지 대상 원장만 일괄 조회해요.
예약·가게 내부 ID, 예약 상태·삭제 시각, 플래그, 불일치 방향, 확정 순액·환불액·상태별 집계만
반환해요. 고객 개인정보·주문번호·PG 식별자, PG 호출·행 잠금·상태 변경은 없어요.

- `DEPOSIT_PAID_WITHOUT_POSITIVE_LEDGER`: 플래그 true인데 양수 확정 원장이 없어요.
- `POSITIVE_LEDGER_WITHOUT_DEPOSIT_PAID`: 플래그 false/null인데 양수 확정 원장이 있어요.

배포 전에는 운영자의 승인된 읽기 전용 DB 접근으로 아래 조건을 사용해요.
예약·결제 식별자나 조회 결과를 채팅·공개 로그에 붙이지 않아요.

```sql
WITH deposit_comparison AS (
  SELECT r.reservation_id, r.deposit_paid,
         EXISTS (
           SELECT 1 FROM payment p
           WHERE p.reservation_id = r.reservation_id
             AND p.paid_at IS NOT NULL
             AND p.status IN ('PAID', 'PARTIAL_REFUNDED', 'REFUND_PENDING', 'REFUNDED')
             AND p.amount - COALESCE(p.refund_amount, 0) > 0
         ) AS has_positive_net
  FROM reservation r
)
SELECT reservation_id, deposit_paid, has_positive_net
FROM deposit_comparison
WHERE (deposit_paid = TRUE AND has_positive_net = FALSE)
   OR ((deposit_paid = FALSE OR deposit_paid IS NULL) AND has_positive_net = TRUE)
ORDER BY reservation_id
LIMIT 100;
```

대상별 예약·결제·환불 상태와 금액을 읽기 전용으로 대조하고, PortOne 콘솔의 실제 결제·취소
상태·금액을 확인해요. **플래그·원장 직접 수정, 자동 환불, 단순 재취소는 금지**예요.
원인이 확인될 때까지 운영 조사 항목으로 남겨요.

대사 큐 원인 코드:

| 원인 | 의미 |
|---|---|
| `EXPIRY_RECHECK_FAILED` | 예약 만료 직전 PortOne 조회 실패 |
| `EXPIRY_STATUS_UNCERTAIN` | 조회는 됐지만 자동 판정 대상이 아닌 PG 상태 |
| `LOCAL_STATUS_UNCERTAIN` | 로컬 결제 상태가 만료 처리 계약과 맞지 않음 |
| `STALE_READY_RECHECK_FAILED` | 오래된 READY 결제의 PortOne 조회 실패 |
| `STALE_READY_STILL_PENDING` | PG도 아직 결제 대기 |
| `STALE_READY_STATUS_UNCERTAIN` | 조회는 됐지만 자동 정리 대상이 아닌 PG 상태 |
| `LATE_PAID_RESERVATION` | 이미 취소·종료된 예약에서 PAID 확인 |
| `PAID_STATE_CONFLICT` | PG는 PAID지만 로컬 결제가 READY/PAID가 아님 |
| `PAID_AMOUNT_MISMATCH` | PG 결제액과 서버 결제액 불일치 |
| `REFUND_LEDGER_MISSING` | 로컬 결제는 환불 미결인데 미결 원장 행이 없음 |
| `REFUND_STATE_UNCERTAIN` | PG 취소 ID·금액·상태와 로컬 상태가 맞지 않음 |

같은 결제·같은 범주는 새 행 대신 `occurrenceCount`, `lastSeenAt`, 원인 코드를 갱신해요. 안전하게 복구되거나 미결제가 확정되면 자동으로 `RESOLVED`가 돼요.

대응 순서:

1. 큐에서 `merchantUid`, `paymentId`, `reservationId`, 원인 코드를 확인해요
2. PortOne 콘솔에서 `merchantUid`의 실제 결제·취소 상태와 금액을 확인해요
3. `LATE_PAID_RESERVATION`과 금액 불일치는 예약 자동 복원이나 DB 직접 수정을 하지 않아요
4. 결제 유지·예약 복원·전액 환불 중 무엇이 맞는지 예약 상태와 고객 안내를 함께 판단해요
5. 웹훅 전송 문제면 inbox 재처리를 실행하고 `PROCESSED` 또는 열린 대사 건을 다시 확인해요

배포 직후 구조와 큐를 한 번에 보려면 `scripts/verify-post-deploy-readonly.sh`를 써요. 종료 코드 `2`는 운영자 확인 항목이 있다는 뜻이에요.
