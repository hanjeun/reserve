# 데이터 생명주기

회원 탈퇴와 가게 영업 종료 때 무엇을 막고, 지우고, 남기는지 정리해요.

## 원칙

1. 예약·결제·환불·리뷰·광고처럼 거래나 분쟁에 연결된 행은 FK와 상태를 보존해요.
2. 탈퇴·폐업 전에 해결할 의무는 `DataLifecycleGuard` 한 곳에서 검사해요.
3. 보존하는 행에서도 로그인·연락·위치 같은 직접 식별자는 지워요.
4. S3 삭제는 durable outbox로 넘겨요.
5. OAuth 연동 해제는 DB 탈퇴 커밋 뒤에만 시도해요.

## 가게 영업 종료

아래 값이 모두 0이어야 해요. 하나라도 남으면 `409 Conflict`예요.

| 항목 | 차단 상태 |
|---|---|
| 예약 | `PENDING`, `CONFIRMED`, `UNCONFIRMED` |
| 광고 노출 | `PENDING_PAYMENT`, `ACTIVE`, `REFUND_PENDING`, `REVIEW_REQUIRED` |
| 광고 금융 | 미결 `AdPaymentAttempt` (`READY`, `REFUND_PENDING`, `REVIEW_REQUIRED`) 및 현재 UID 미이관 광고 |
| 환불 | 미해결 `RefundAttempt` |
| 결제 대사 | 예약 `OPEN` 이슈 + 광고 미결/미이관 건수 |
| 웹훅 | 미완료 inbox |

- 가게 행은 예약 생성·수정과 같은 비관적 잠금으로 읽어요. 광고 생성·금융 전이·가게 수정·제재도 같은 잠금을 지나요.
- 광고 원장은 숨김 상태와 관계없이 검사하고, 로컬 `PAYMENT_FAILED`나 `CANCELLED`만으로 종결을 인정하지 않아요. 절차는 [광고 결제 런북](ad-payments.md)을 따라요.

종료 시 처리:

- 가게와 광고의 이미지 경로를 `file_deletion_task`에 넣고 이미지 필드를 비워요.
- 즐겨찾기와 홍보 연결을 지워요.
- 가게에 `deletedAt`을 기록해 공개 목록과 신규 예약에서 빼요.
- 가게·예약·결제·환불·리뷰·광고 원장은 물리 삭제하지 않아요. 결제·예약·리뷰 repository에는 가게/회원 일괄 삭제와 기간 일괄 삭제 메서드를 두지 않아요.

| API | 용도 |
|---|---|
| `GET /api/stores/{id}/closure-readiness` | 차단 건수 조회 |
| `DELETE /api/stores/{id}` | 영업 종료 |

## 회원 탈퇴

아래 값이 모두 0이어야 해요. 하나라도 남으면 `409 Conflict`예요.

| 항목 | 차단 상태 |
|---|---|
| 소유 가게 | `deletedAt IS NULL`인 가게 |
| 예약 | `PENDING`, `CONFIRMED`, `UNCONFIRMED` |
| 환불 | 미해결 `RefundAttempt` |
| 결제 대사 | 예약 `OPEN` 이슈 + 광고 미결/미이관 건수 |
| 웹훅 | 미완료 inbox |

탈퇴 시 처리:

- 회원 정보 수정·프로필/동의/위치 변경·비밀번호 재설정·예약 생성과 탈퇴는 같은 회원 행 비관적 잠금을 써요.
- 회원 행은 지우지 않고 이메일을 `withdrawn-{memberId}@reserve.invalid`로 바꿔요.
- 이름은 `탈퇴한 회원`, 역할은 `USER`, 상태는 `ACTIVE`로 정규화하고 `deletedAt`을 기록해요.
- 비밀번호·OAuth 식별자/토큰·프로필·알림/동의·위치·제재 정보를 비워요.
- 결제의 구매자 이름/이메일/전화번호와 예약의 자유 입력 요청사항을 비워요.
- refresh/password-reset/email-verification 토큰을 지워요.
- 즐겨찾기·홍보·커뮤니티 작성물/반응·사업자 인증을 지워요.
- 프로필과 사업자등록증 이미지는 파일 삭제 outbox에 넣어요.
- 예약·결제·환불·리뷰·문의·채팅·채팅 신고와 회원 FK는 보존해요. 공개 리뷰 DTO는 회원 식별자를 내보내지 않아요.
- 성공하면 access/refresh 쿠키를 지워요. JWT 인증은 매 요청 회원 상태와 역할을 DB에서 확인해요.

| API | 용도 |
|---|---|
| `GET /api/member/withdrawal-readiness` | 차단 건수 조회 |
| `DELETE /api/member/delete` | 탈퇴 |

## S3 파일 삭제 outbox

`file_deletion_task`는 비즈니스 변경과 같은 트랜잭션에 삭제 의도를 기록해요. `FileDeletionScheduler`가 기본 60초 간격, 한 번에 최대 50건씩 S3에서 지워요.

| 필드/상태 | 의미 |
|---|---|
| `target_hash` | 경로 SHA-256. unique 제약으로 중복 작업을 막아요 |
| `PENDING` | 아직 시도하지 않음 |
| `FAILED` | 지수 backoff 뒤 재시도 |
| `COMPLETED` | 삭제 성공. `target` 경로도 `NULL`로 지움 |

항목마다 `REQUIRES_NEW` 트랜잭션과 행 잠금을 써요. 로그에는 task ID와 예외 종류만 남겨요.

확인 쿼리:

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

회원 비식별화와 같은 트랜잭션에서 `oauth_unlink_task`에 제공자·회원·암호화 토큰을 저장하고, 커밋 뒤 스케줄러가 제공자를 호출해요. 실패하면 지수 backoff로 재시도해요.

- `task_key` unique로 회원·provider별 중복 등록을 막아요.
- access token은 AES-GCM 암호문만 저장하고 완료 즉시 NULL로 지워요.
- 토큰이 없던 탈퇴는 `BLOCKED`, 제공자 실패는 `FAILED`, 성공은 `COMPLETED`예요.
- 로그에 토큰·제공자 응답 본문을 남기지 않아요.
- `FAILED/BLOCKED`가 있으면 15분마다 `OAuth unlink queue requires attention` 로그가 나요([모니터링](monitoring.md) Grafana 알림 8번).

상태와 키 설정은 [계정 보안 계약](account-security.md)에 있어요.

## 휴지통과 감사로그

| 대상 | 보존 기간 |
|---|---|
| `SOFT_DELETE` 휴지통 | 30일 |
| 복구/영구삭제/제재 등 일반 감사로그 | 90일 |

- 만료 항목은 `AuditCleanupWorker`가 항목별 `REQUIRES_NEW` 트랜잭션으로 처리해요.
- 결제가 있거나 리뷰가 연결된 예약과 모든 광고는 자동 영구삭제하지 않고 `RETENTION_HOLD`를 남겨요. 광고 원장도 자동 파기하지 않아요.
- 실패한 `SOFT_DELETE` 로그는 일괄 정리에서 빼고 다음 실행에서 다시 시도해요.

## 채팅과 신고 자료

- 일반 글·사진·파일명은 전송일부터 90일, 처리된 일반 신고와 증거는 처리 완료일부터 1년 보존해요.
- 소비자 불만·거래 분쟁은 처리 완료일부터 3년, 계약·결제·공급 증거는 실제 거래일부터 5년 보존해요. 법정 최소 보존 하한을 저장하므로 이후 분류 정정으로 기간을 줄이지 않아요.
- 미처리·미분류 신고, 진행 중인 분쟁과 수동 보류는 원문·증거 파기를 막아요. 접근 기록은 각 접근일부터 1년 또는 법령상 2년을 따로 계산해요.
- 파기 worker는 실제 운영 고지 게시 시각과 30일 유예를 확인해요. 기존 자료에도 적용하지만 고지 전·유예 중에는 만료 자료를 지우지 않아요.
- 글·사진 원문 파기 시 메시지 행·읽음·취소 커서는 남겨요. 만료된 신고·스냅샷은 지우고, 다른 참조가 없는 사진만 파일 삭제 outbox로 보내요.
- 예약·결제·환불·광고 원장의 일괄 기간 파기는 이번 worker의 대상이 아니에요. 기존 `RETENTION_HOLD`와 금융 원장 보존을 유지해요.
- 설정·분류 API와 배포 절차는 [채팅 계약](chat-controls.md), [수동 DDL](manual-ddl.md)을 따라요.

## 직원 웨이팅 접수

- 가게 소유자만 접수·호출·입장·취소를 처리해요. 선택한 팀 표시명·인원·접수 번호·처리 시각만 저장하며 연락처는 수집하지 않아요.
- 실제 고지 게시 후 5분마다 정리해요. 종료·취소한 팀의 표시명은 다음 한국 시간 날짜가 시작된 뒤 제거하고, 종료 기록은 7일 뒤 정리해요. 정상 가게의 대기·호출 중인 접수는 날짜만으로 종료하거나 파기하지 않아요. 가게가 삭제되면 남은 진행팀을 취소하고 표시명을 제거해요.
- `WAITING_RETENTION_NOTICE_PUBLISHED_AT`가 없으면 정리하지 않아요. `WAITING_RETENTION_ENABLED=false`로 일시 중지할 수 있어요.
