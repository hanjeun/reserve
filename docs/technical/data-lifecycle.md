# 데이터 생명주기

> 최종 코드 검증: 2026-09-03, `local-preview-all-changes` 로컬 프리뷰 브랜치.
> 이 문서는 **아직 배포되지 않은 코드의 계약**이다. 운영 MySQL·S3·OAuth 제공자에서의 실기 검증은 아래 체크리스트가 남아 있다.

---

## 원칙

회원 탈퇴와 가게 영업 종료는 행을 연쇄 삭제하는 기능이 아니다.

1. 예약·결제·환불·리뷰·광고처럼 거래나 분쟁에 연결된 행은 FK와 상태를 보존한다.
2. 탈퇴·폐업 전에 해결해야 할 의무는 `DataLifecycleGuard` 한 곳에서 검사한다.
3. 보존하는 행에서도 로그인·연락·위치 같은 직접 식별자는 제거한다.
4. DB 트랜잭션과 원자적으로 묶을 수 없는 S3 삭제는 durable outbox로 넘긴다.
5. OAuth 연동 해제는 DB 탈퇴 커밋 뒤에만 시도한다.

---

## 가게 영업 종료

### 관문

다음 값이 모두 0이어야 한다. 하나라도 남으면 `409 Conflict`로 중단한다.

| 항목 | 차단 상태 |
|---|---|
| 예약 | `PENDING`, `CONFIRMED`, `UNCONFIRMED` |
| 광고 | `PENDING_PAYMENT`, `PAYMENT_FAILED`, `ACTIVE` |
| 환불 | 미해결 `RefundAttempt` |
| 결제 대사 | `OPEN` 이슈 |
| 웹훅 | 미완료 inbox |

가게 행은 예약 생성·수정과 같은 비관적 잠금으로 읽는다. 준비 상태를 확인한 직후 새 예약이 끼어드는
check-then-close 경합을 줄이기 위한 경계다. 광고 생성도 같은 가게 잠금과 삭제 여부 검사를 지난다.

### 종료 시 처리

- 가게와 광고의 이미지 경로를 `file_deletion_task`에 넣고 DB의 이미지 필드를 비운다.
- 즐겨찾기와 홍보 연결을 제거한다.
- 가게에 `deletedAt`을 기록해 공개 목록과 신규 예약에서 제외한다.
- 가게·예약·결제·환불·리뷰·광고 원장은 물리 삭제하지 않는다.
- 결제·예약·리뷰 repository의 가게/회원 일괄 삭제 메서드와 범용 기간 일괄 삭제 메서드는 제거해
  다른 호출부가 생명주기 관문을 우회하지 못하게 한다.

API:

- `GET /api/stores/{id}/closure-readiness`
- `DELETE /api/stores/{id}`

---

## 회원 탈퇴

### 관문

다음 값이 모두 0이어야 한다. 하나라도 남으면 `409 Conflict`로 중단한다.

| 항목 | 차단 상태 |
|---|---|
| 소유 가게 | `deletedAt IS NULL`인 가게 |
| 예약 | `PENDING`, `CONFIRMED`, `UNCONFIRMED` |
| 환불 | 미해결 `RefundAttempt` |
| 결제 대사 | `OPEN` 이슈 |
| 웹훅 | 미완료 inbox |

### 탈퇴 시 처리

- 회원 정보 수정·프로필/동의/위치 변경·비밀번호 재설정·예약 생성과 탈퇴는 같은 회원 행의
  비관적 잠금 관문을 사용한다. 탈퇴 직전에 시작된 요청이 비식별 상태를 덮어쓰거나 새 예약을 만드는 것을 막는다.
- 회원 행을 삭제하지 않고 `withdrawn-{memberId}@reserve.invalid`로 이메일을 치환한다.
- 이름은 `탈퇴한 회원`, 역할은 `USER`, 상태는 `ACTIVE`로 정규화하고 `deletedAt`을 기록한다.
- 비밀번호·OAuth 식별자/토큰·프로필·알림/동의·위치·제재 정보를 비운다.
- 결제의 중복 구매자 이름/이메일/전화번호와 예약의 자유 입력 요청사항을 비운다.
- refresh/password-reset/email-verification 토큰을 제거한다.
- 즐겨찾기·홍보·커뮤니티 작성물/반응·사업자 인증을 제거한다.
- 프로필과 사업자등록증 이미지는 파일 삭제 outbox에 넣는다.
- 예약·결제·환불·리뷰·문의·채팅과 회원 FK는 보존한다. 공개 리뷰 DTO는 회원 식별자를 내보내지 않는다.
- 응답이 성공하면 access/refresh 쿠키를 삭제한다. 이후 JWT 인증도 매 요청 회원의 삭제·정지·영구정지
  상태와 현재 역할을 DB에서 확인하므로 탈퇴하거나 제재된 회원의 기존 access token은 인증에 사용할 수 없다.

API:

- `GET /api/member/withdrawal-readiness`
- `DELETE /api/member/delete`

---

## S3 파일 삭제 outbox

`file_deletion_task`는 비즈니스 변경과 같은 DB 트랜잭션에 삭제 의도를 기록한다. 실제 S3 호출은
`FileDeletionScheduler`가 기본 60초 간격, 한 번에 최대 50건씩 처리한다.

| 필드/상태 | 의미 |
|---|---|
| `target_hash` | 경로 SHA-256. unique 제약으로 같은 대상의 중복 작업을 막는다. |
| `PENDING` | 아직 시도하지 않음 |
| `FAILED` | 지수 backoff 뒤 재시도 |
| `COMPLETED` | 삭제 성공. 원본 `target` 경로도 즉시 `NULL`로 제거 |

항목 하나마다 `REQUIRES_NEW` 트랜잭션과 행 잠금을 사용하므로 한 대상의 실패가 다음 대상을 막지 않는다.
로그에는 파일 경로를 남기지 않고 task ID와 예외 종류만 남긴다.

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

---

## OAuth 연동 해제

외부 OAuth 해제는 DB 트랜잭션보다 먼저 실행하지 않는다. 탈퇴 이벤트를 발행하고
`AFTER_COMMIT` 리스너가 제공자 해제를 시도한다. 실패하면 토큰을 로그에 남기지 않고
`OAuth unlink requires manual follow-up` 오류를 남긴다.

현재 이 외부 호출에는 durable retry 저장소가 없다. 앱이 DB 커밋 직후 종료되거나 제공자 호출이 실패하면
운영자가 로그를 보고 수동 확인해야 한다. 정식 배포 전에는 outbox 기반 재시도 도입 여부를 결정한다.

---

## 휴지통과 감사로그

- `SOFT_DELETE` 휴지통 보존 기간: 30일
- 복구/영구삭제/제재 등 일반 감사로그 보존 기간: 90일
- 만료 항목은 별도 `AuditCleanupWorker`가 항목별 `REQUIRES_NEW` 트랜잭션으로 처리한다.
- 결제가 있거나 리뷰가 연결된 예약, 금전 상태의 광고는 자동 영구삭제하지 않고 `RETENTION_HOLD`를 남긴다.
- 실패한 `SOFT_DELETE` 로그는 일괄 로그 정리에서 제외해 다음 실행에서 다시 시도한다.

30일/90일은 현재 애플리케이션 동작의 정본이다. 거래·분쟁 행의 최종 보존 기간과 자동 파기 기준은
법적·운영 승인을 거친 정책이 아직 없으므로 코드가 임의로 영구삭제하지 않는다.

---

## 배포 전 운영 검증

- [ ] 운영 백업이 존재하고 별도 빈 DB로 복원 가능한지 먼저 확인
- [ ] 재시작 후 운영 MySQL에 `file_deletion_task`와 결제 inbox/대사 테이블이 생성됐는지 확인
- [ ] `SHOW CREATE TABLE file_deletion_task`와 `SHOW INDEX`로 unique/index 확인
- [ ] S3 IAM이 대상 객체 삭제만 허용하는지 확인
- [ ] S3 삭제 실패를 한 번 만들고 `FAILED → COMPLETED` 재시도를 실기 확인
- [ ] 각 OAuth 제공자에서 탈퇴 후 연동이 실제 해제되는지 확인
- [ ] 예약 생성과 가게 종료 동시 요청, 광고 생성과 가게 종료 동시 요청을 MySQL에서 실기 확인
- [ ] 예약 생성·회원정보 수정·비밀번호 재설정과 회원 탈퇴 동시 요청을 MySQL에서 실기 확인
- [ ] 회원/가게 준비 상태 API의 차단 건수와 운영 DB 원장을 표본 대조
- [ ] 보존 중인 리뷰·문의·채팅 본문에 대한 최종 개인정보 보존/파기 정책 승인
- [ ] 거래·분쟁 원장의 최종 파기 기간과 실행 주체 결정

---

## 로컬 검증 증거

2026-09-03 현재:

- `backend/gradlew.bat test`: 166 tests, failures 0, errors 0, skipped 0
- `frontend/npm.cmd run lint:ci`: 성공
- `frontend/npm.cmd run test:run`: 4 files, 10 tests 성공
- `frontend/npm.cmd run test:e2e`: PC·Pixel 7 핵심 흐름 12 tests 성공
- `frontend/npm.cmd run build`: 성공, 초기 JS 318.1 KiB gzip·최대 청크 555.1 KiB 예산 통과
- `node scripts/validate-grafana-dashboards.mjs`: 성공

이 결과는 컴파일·단위/통합 테스트, 모의 API 브라우저 흐름과 H2 쿼리 실행 증거다. 운영 MySQL의
잠금 동작, 실제 PortOne 웹훅·S3 삭제, OAuth 제공자 응답, 배포 설정을 증명하지는 않는다.
