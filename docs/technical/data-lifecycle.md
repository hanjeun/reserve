# 데이터 생명주기

회원 탈퇴와 가게 영업 종료 때 무엇을 막고, 무엇을 지우고, 무엇을 남기는지 정리해요.

## 원칙

회원 탈퇴와 가게 영업 종료는 행을 연쇄 삭제하는 기능이 아니에요.

1. 예약·결제·환불·리뷰·광고처럼 거래나 분쟁에 연결된 행은 FK와 상태를 보존해요.
2. 탈퇴·폐업 전에 해결해야 할 의무는 `DataLifecycleGuard` 한 곳에서 검사해요.
3. 보존하는 행에서도 로그인·연락·위치 같은 직접 식별자는 지워요.
4. DB 트랜잭션과 원자적으로 묶을 수 없는 S3 삭제는 durable outbox로 넘겨요.
5. OAuth 연동 해제는 DB 탈퇴 커밋 뒤에만 시도해요.

## 가게 영업 종료

### 관문

아래 값이 모두 0이어야 해요. 하나라도 남으면 `409 Conflict`로 중단해요.

| 항목 | 차단 상태 |
|---|---|
| 예약 | `PENDING`, `CONFIRMED`, `UNCONFIRMED` |
| 광고 노출 | `PENDING_PAYMENT`, `ACTIVE`, `REFUND_PENDING`, `REVIEW_REQUIRED` |
| 광고 금융 | 미결 `AdPaymentAttempt` (`READY`, `REFUND_PENDING`, `REVIEW_REQUIRED`) 및 현재 UID 미이관 광고 |
| 환불 | 미해결 `RefundAttempt` |
| 결제 대사 | 예약 `OPEN` 이슈 + 광고 미결/미이관 건수 |
| 웹훅 | 미완료 inbox |

- 가게 행은 예약 생성·수정과 같은 비관적 잠금으로 읽어요. 준비 상태 확인 직후 새 예약이 끼어드는 check-then-close 경합을 줄이기 위해서예요.
- 광고 생성·금융 전이·가게 수정·제재도 같은 가게 잠금을 지나요.
- 광고 원장은 숨김 상태와 관계없이 검사해요. 로컬 `PAYMENT_FAILED`나 `CANCELLED`만으로 종결을 인정하지 않아요. PG 증거와 이관/수동 복구 절차는 [광고 결제 런북](ad-payments.md)을 따라요.

### 종료 시 처리

- 가게와 광고의 이미지 경로를 `file_deletion_task`에 넣고 DB의 이미지 필드를 비워요.
- 즐겨찾기와 홍보 연결을 지워요.
- 가게에 `deletedAt`을 기록해 공개 목록과 신규 예약에서 빼요.
- 가게·예약·결제·환불·리뷰·광고 원장은 물리 삭제하지 않아요.
- 결제·예약·리뷰 repository의 가게/회원 일괄 삭제 메서드와 범용 기간 일괄 삭제 메서드는 없앴어요. 다른 호출부가 생명주기 관문을 우회하지 못하게 하려는 거예요.

API:

- `GET /api/stores/{id}/closure-readiness`
- `DELETE /api/stores/{id}`

## 회원 탈퇴

### 관문

아래 값이 모두 0이어야 해요. 하나라도 남으면 `409 Conflict`로 중단해요.

| 항목 | 차단 상태 |
|---|---|
| 소유 가게 | `deletedAt IS NULL`인 가게 |
| 예약 | `PENDING`, `CONFIRMED`, `UNCONFIRMED` |
| 환불 | 미해결 `RefundAttempt` |
| 결제 대사 | 예약 `OPEN` 이슈 + 광고 미결/미이관 건수 |
| 웹훅 | 미완료 inbox |

### 탈퇴 시 처리

- 회원 정보 수정·프로필/동의/위치 변경·비밀번호 재설정·예약 생성과 탈퇴는 같은 회원 행의 비관적 잠금 관문을 써요. 탈퇴 직전에 시작된 요청이 비식별 상태를 덮어쓰거나 새 예약을 만드는 걸 막아요.
- 회원 행을 지우지 않고 이메일을 `withdrawn-{memberId}@reserve.invalid`로 바꿔요.
- 이름은 `탈퇴한 회원`, 역할은 `USER`, 상태는 `ACTIVE`로 정규화하고 `deletedAt`을 기록해요.
- 비밀번호·OAuth 식별자/토큰·프로필·알림/동의·위치·제재 정보를 비워요.
- 결제의 중복 구매자 이름/이메일/전화번호와 예약의 자유 입력 요청사항을 비워요.
- refresh/password-reset/email-verification 토큰을 지워요.
- 즐겨찾기·홍보·커뮤니티 작성물/반응·사업자 인증을 지워요.
- 프로필과 사업자등록증 이미지는 파일 삭제 outbox에 넣어요.
- 예약·결제·환불·리뷰·문의·채팅·채팅 신고와 회원 FK는 보존해요. 공개 리뷰 DTO는 회원 식별자를 내보내지 않아요.
- 응답이 성공하면 access/refresh 쿠키를 지워요. JWT 인증도 매 요청 회원의 삭제·정지·영구정지 상태와 현재 역할을 DB에서 확인하므로, 탈퇴하거나 제재된 회원의 기존 access token은 쓸 수 없어요.

API:

- `GET /api/member/withdrawal-readiness`
- `DELETE /api/member/delete`

## S3 파일 삭제 outbox

`file_deletion_task`는 비즈니스 변경과 같은 DB 트랜잭션에 삭제 의도를 기록해요. 실제 S3 호출은 `FileDeletionScheduler`가 기본 60초 간격, 한 번에 최대 50건씩 처리해요.

| 필드/상태 | 의미 |
|---|---|
| `target_hash` | 경로 SHA-256. unique 제약으로 같은 대상의 중복 작업을 막아요 |
| `PENDING` | 아직 시도하지 않음 |
| `FAILED` | 지수 backoff 뒤 재시도 |
| `COMPLETED` | 삭제 성공. 원본 `target` 경로도 즉시 `NULL`로 지움 |

항목마다 `REQUIRES_NEW` 트랜잭션과 행 잠금을 쓰므로 한 대상의 실패가 다음 대상을 막지 않아요. 로그에는 파일 경로 없이 task ID와 예외 종류만 남겨요.

운영 확인 쿼리:

```sql
SELECT status, COUNT(*)
FROM file_deletion_task
GROUP BY status;

SELECT file_deletion_task_id, source_type, source_id, attempt_count,
       next_attempt_at, last_error_type
FROM file_deletion_task
WHERE status = 'FAILED'
ORDER BY next_attempt_at ASC;
```

## OAuth 연동 해제

외부 OAuth 해제는 DB 트랜잭션보다 먼저 실행하지 않아요. 회원 비식별화와 같은 트랜잭션에서 `oauth_unlink_task`에 제공자·회원·암호화 토큰을 저장하고, 커밋 뒤 스케줄러가 제공자를 호출해요. 커밋 직후 앱이 죽거나 제공자 호출이 실패해도 작업은 남아 지수 backoff로 재시도해요.

- `task_key` unique로 회원·provider별 중복 enqueue를 막아요.
- access token은 목적 분리 AES-GCM 암호문만 저장하고 완료 즉시 NULL로 지워요.
- 짧은 `PROCESSING` lease 앞뒤에서만 DB 행을 잠그고, 제공자 HTTP 호출 중에는 트랜잭션을 열어 두지 않아요.
- 토큰이 없던 탈퇴는 `BLOCKED`, 제공자 실패는 `FAILED`, 성공은 `COMPLETED`예요.
- 로그에 토큰·제공자 응답 본문을 남기지 않아요.
- `FAILED/BLOCKED`가 하나라도 있으면 15분마다 `OAuth unlink queue requires attention` 집계 로그가 나요([모니터링](monitoring.md) Grafana 알림 8번).

키·상태·운영 절차는 [계정 보안 계약](account-security.md)을 따라요.

## 휴지통과 감사로그

| 대상 | 보존 기간 |
|---|---|
| `SOFT_DELETE` 휴지통 | 30일 |
| 복구/영구삭제/제재 등 일반 감사로그 | 90일 |

- 만료 항목은 별도 `AuditCleanupWorker`가 항목별 `REQUIRES_NEW` 트랜잭션으로 처리해요.
- 결제가 있거나 리뷰가 연결된 예약과 모든 광고는 자동 영구삭제하지 않고 `RETENTION_HOLD`를 남겨요. 과거 광고 표시 상태만으로 이전 UID의 결제를 배제할 수 없기 때문이에요. 광고 원장도 자동 파기하지 않아요.
- 실패한 `SOFT_DELETE` 로그는 일괄 로그 정리에서 빼서 다음 실행에서 다시 시도해요.

30일/90일은 현재 애플리케이션 동작의 정본이에요. 거래·분쟁 행의 최종 보존 기간과 자동 파기 기준은 법적·운영 승인을 거친 정책이 아직 없어서, 코드가 임의로 영구삭제하지 않아요.

## 운영 검증 체크리스트

단위·H2 테스트는 운영 MySQL 잠금, 실제 PortOne 웹훅·S3 삭제, OAuth 제공자 응답, 배포 설정을 증명하지 않아요. 아래는 운영에서 따로 확인할 항목이에요.

- [ ] 운영 백업이 존재하고 별도 빈 DB로 복원 가능한지 먼저 확인
- [ ] 재시작 후 운영 MySQL에 `file_deletion_task`, OAuth unlink·마케팅 동의 이력, 결제 inbox/대사 테이블이 생성됐는지 확인
- [ ] `SHOW CREATE TABLE file_deletion_task`와 `SHOW INDEX`로 unique/index 확인
- [ ] S3 IAM이 대상 객체 삭제만 허용하는지 확인
- [ ] S3 삭제 실패를 한 번 만들고 `FAILED → COMPLETED` 재시도를 실기 확인
- [ ] 각 OAuth 제공자에서 탈퇴 후 연동이 실제 해제되는지 확인
- [ ] OAuth unlink의 `FAILED → COMPLETED`와 `BLOCKED` 운영 알림 확인
- [ ] 예약 생성과 가게 종료 동시 요청, 광고 생성과 가게 종료 동시 요청을 MySQL에서 실기 확인
- [ ] 예약 생성·회원정보 수정·비밀번호 재설정과 회원 탈퇴 동시 요청을 MySQL에서 실기 확인
- [ ] 회원/가게 준비 상태 API의 차단 건수와 운영 DB 원장을 표본 대조
- [ ] 보존 중인 리뷰·문의·채팅 본문과 신고 hold에 대한 최종 개인정보 보존/파기 정책 승인
- [ ] 거래·분쟁 원장의 최종 파기 기간과 실행 주체 결정
