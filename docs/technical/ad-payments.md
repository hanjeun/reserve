# 광고 결제 시도 · 대사 · 환불

광고 결제는 예약과 다른 원장(`AdPaymentAttempt`)과 상태기계를 써요. 공통 결제 절차는 [결제 런북](payments.md)에 있어요.

## 기본 규칙

- 광고 노출 상태와 돈의 상태는 달라요. `CANCELLED`는 노출 중단이지 미결제·환불 완료가 아니에요.
- 광고마다 현재 주문번호가 있고, 발급한 모든 주문번호는 `ad_payment_attempt`에 남아요.
- 환불은 요청이에요. PG 재조회에서 주문번호·KRW·원금·전체 취소액이 맞아야 `REFUNDED`가 돼요.
- 결과를 잃은 환불은 자동으로 다시 보내지 않아요.
- 일할 계산이 없어요. `ACTIVE` 광고를 취소하면 그 시도의 고정 원금 전액을 취소 요청해요.

## 구성

| 코드 | 책임 |
|---|---|
| `Advertisement` | 콘텐츠·노출 기간·노출 상태·현재 merchantUid |
| `AdPaymentAttempt` | 시도별 고정 주문번호/광고/가게/소유자/금액, PG 관측, 미결 사유, 취소 의도, 발신/확인 시각 |
| `AdPaymentLedgerService` | 짧은 DB 단계. 잠금 → 검증 → 저장. PG 호출 없음 |
| `AdPaymentService` | PG 통신 조정. `Propagation.NEVER`로 DB 트랜잭션 안에서 실행되지 않음 |
| `PortoneWebhookService` | inbox 처리에서 예약 원장을 먼저 찾고, 광고 시도는 광고 처리기로 라우팅 |
| `AdPaymentReconciliationScheduler` | 미결 재조회와 기존 광고 소량 이관 |
| `DataLifecycleGuard` | 미결·미이관 광고를 폐업/탈퇴 차단 건수에 포함 |

- 원장은 cascade 대신 고정 id를 저장해요. 원금·주문번호·소유자 id는 생성 뒤 바꾸지 않아요.
- 환불 키·lease 토큰·원본 PG 응답·구매자 PII는 관리자 응답에 넣지 않아요.

## 상태 판정

PG 결과는 매번 서버에서 다시 조회해요.

| 확인 결과 | 원장/동작 |
|---|---|
| `READY`, 결제 관측 이력 없음 | 같은 주문번호 재사용. 미결 유지 |
| `NOT_FOUND` | 같은 주문번호만 재사용. 새 주문번호 발급 없음 |
| 조회 실패·알 수 없는 상태 | `REVIEW_REQUIRED`, 새 결제 차단 |
| PG `FAILED`, 과거 PAID/환불 발신 없음 | `FAILED`. 다른 미결 시도가 없으면 새 주문번호 발급, 이전 행 보존 |
| `PAID`, 원금/통화 일치, 취소액 0, 서비스 제공 가능 | 원장 `PAID`. `PENDING_PAYMENT`만 `ACTIVE`로 전이 |
| 취소/폐업/정지/숨김/기간 경과/과거 주문번호의 늦은 `PAID` | 광고를 되살리지 않고 대사 사유 기록. 취소 의도가 없으면 자동 환불 없음 |
| 저장된 취소 의도 + 확정 `PAID` | 환불 발신 의도/키를 커밋한 뒤 전액 취소 요청 |
| 취소 API `REQUESTED`·`UNKNOWN`·`FAILED`·`SUCCEEDED` | 모두 `REFUND_PENDING`으로 재조회 |
| PG `CANCELLED`, 전체 취소액 = 고정 원금 | 원장 `REFUNDED`, 최초 확인 시각 보존 |
| 부분 취소·취소액 누락·주문번호/원금/통화 불일치 | 대사 필요. 자동 잔액 환불·금액 수정 없음 |
| 전액 환불 확인 이후 `PAID` | 불일치로 보류, 두 번째 자동 환불 없음 |

- 한 번 `PAID`를 관측한 시도는 이후 `FAILED`로 되돌리지 않아요.
- 외부에서 요청된 취소가 진행 중이면 추가 취소를 보류해요.
- `SUSPENDED` 광고는 결제 콜백으로 `ACTIVE`가 되지 않아요.

## 트랜잭션과 잠금

행 잠금 순서는 **Store → Advertisement → AdPaymentAttempt**예요. 광고 생성, 가게 수정/폐업/제재도 같은 Store 행을 지나요. PG를 기다리는 동안에는 잠금을 쥐지 않아요.

1. DB에서 소유권을 확인하고 5분 lease와 토큰을 저장해요.
2. 트랜잭션 밖에서 PG를 조회해요.
3. 다시 행을 잠그고 토큰을 비교해요. 다른 실행이 인계받았으면 응답을 버려요.
4. 환불이면 고정 키·취소 의도·발신 예정 시각을 먼저 커밋해요.
5. PG 취소를 호출하고 응답을 저장해요.
6. 다음 GET 대사가 전체 취소액을 확인해요. 같은 시도에 두 번째 자동 POST는 없어요.

- `refundDispatchedAt`은 발신 전에 저장한 의도 시각이에요.
- `PAID`/`REFUNDED`로 끝난 시도는 정기 조회에서 빠지고, 이후 변경은 웹훅이나 관리자 대사로 확인해요.
- PortOne 취소 요청에는 저장한 `Idempotency-Key`와 `currentCancellableAmount`를 함께 보내요. 키는 ASCII 16–256자 따옴표 문자열 헤더예요. 참고: [PortOne V2 공통 안내](https://developers.portone.io/api/rest-v2/overview), [취소 API](https://developers.portone.io/api/rest-v2/payment).

## 관리자 화면과 API

관리자 → 결제 운영 → **광고 결제**. `확인 필요`는 사유 코드가 있는 시도, `전체 이력`은 모든 시도를 보여 줘요. 페이지 기본 20, 최대 100이에요.

| API | 성격 |
|---|---|
| `GET /api/admin/ad-payments?page=0&size=20&openOnly=true` | ADMIN 전용 원장 조회. PG 호출·상태 전이 없음 |
| `POST /api/admin/ad-payments/{id}/reconcile` | PG 재조회. 저장된 취소 의도가 있으면 첫 환불 요청도 실행 |
| `POST /api/admin/ad-payments/{id}/refund` | ADMIN 전용. PG PAID와 대사 사유를 확인한 시도의 전액 환불 의도 등록 후 처리 |
| `GET /api/payment/status?type=ad&merchantUid=...` | 본인 주문만 DB 조회. PG 호출 없음, 다른 사람/없는 주문 동일 404, `no-store` |

- `refund`도 중복 발신 제한이나 과거 환불 확인을 우회하지 않아요. 미결 사유를 지우는 API는 없어요.
- 준비/검증 API가 409를 내도 별도 트랜잭션의 실패/불일치 기록은 남아요.

## 수동 대사 절차

대상: 응답을 잃은 환불, 부분 취소, 오래된 NOT_FOUND/READY, 숨긴 광고의 PAID, 원금 불일치, 과거 REFUNDED 모순.
먼저 건별 승인과 TEST/LIVE 채널을 확인해요.

1. 원장을 GET으로 조회해요. 시도 id, 주문번호, 고정 원금, 사유, 마지막 조회/발신 시각을 확인해요.
2. 같은 채널의 PortOne 콘솔에서 주문번호와 모든 취소 이력·금액·완료 여부를 대조해요.
3. 단순 조회 실패라면 `대사·처리`로 재조회해요.
4. 결제는 됐지만 서비스 제공이 불가능하고 발신한 환불이 없다면, 승인받은 시도에만 `환불 요청`을 써요.
5. 발신 기록이 있는데 결말이 불명확하면 다시 누르거나 새 키를 만들지 않고, PG 측 진행 중 취소를 확인해요.
6. PG에서 미발신/실패가 확인되면 별도 승인 후 PortOne 콘솔에서 처리하고, GET 대사로 전체 취소를 확인해요.
7. 원장 행 삭제나 수동 `REFUNDED` UPDATE는 하지 않아요.
8. 결과에는 시도 id·상태·금액 대조 결과·확인 시각·승인 범위만 남겨요.

## 배치 설정

| 이름 | 용도 |
|---|---|
| `advertisement.payments.reconciliation-enabled` | 대사 배치 사용 여부. 기본 `true`, 로컬 테스트 `false` |
| `advertisement.payments.reconcile-delay-ms` | 대사 배치 간격. 기본 300000ms, 시작 5분 뒤 첫 실행 |

- 광고 기간 정리는 10분 간격, 기동 30초 뒤 첫 실행이에요. 시작일이 지난 `PENDING_PAYMENT`/`PAYMENT_FAILED` 광고를 `CANCELLED`로 바꾸고 원장은 보존해요.
- 한 번 실행에 기존 광고 이관 최대 10건, 재조회 기한이 된 시도 최대 10건을 처리해요.
- 미결 건은 `nextCheckAt` 순으로 처리하고, 사유가 있으면 최소 5분 뒤 다시 확인해요.
- 새 신청 중복 검사는 오늘 이후 시작하는 결제 대기/실패 건만 막아요.
- 배치를 꺼도 사용자/관리자/웹훅 요청은 계속 처리돼요.
