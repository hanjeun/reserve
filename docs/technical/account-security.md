# 계정·비밀번호 보안 계약

비밀번호 정책, 세션 무효화, 로그인 유지(refresh 회전), 동의 기록, OAuth 연동 해제의 계약을 정리해요. 운영 DB 구조 확인은 [수동 DDL 런북](manual-ddl.md) 3장을 보세요.

## 비밀번호 정책

회원가입·재설정·변경은 `PasswordPolicy`를 공통으로 써요. 서버 정책이 최종 관문이고, DTO Bean Validation과 서비스 검사를 함께 둬요.

| 규칙 | 값 |
|---|---|
| 문자 수 | 8~64자 |
| 조합 | ASCII 영문 1자 이상 + 숫자 1자 이상 |
| bcrypt 입력 | UTF-8 72바이트 이하 |
| 유출 비밀번호 | `PwnedPasswordChecker`로 거부 |

| 동작 | 엔드포인트 | 추가 조건 |
|---|---|---|
| 회원가입 | `POST /api/auth/signup` | 비밀번호 확인·필수 약관·이메일 인증 |
| 비밀번호 재설정 | `POST /api/password-reset/reset` | 6자리 코드 검증 완료·시도 제한 |
| 로그인 중 변경 | `PUT /api/member/password` | 현재 비밀번호 재인증·기존 비밀번호와 다름 |

일반 프로필 수정 DTO에는 비밀번호 필드가 없어요.

## 가입 이메일 인증 (v2.9.0 출시 계약)

- 코드와 가입 증명은 최초 발급의 **5분** 만료 시각을 공유해요. 만료 시각과 같거나 이후면 인증·가입을 거부하며, 코드 확인 성공으로 유효기간을 연장하지 않아요.
- 같은 이메일의 재발송은 1분 간격이에요. 한 행을 잠그고 기존 코드·증명 해시·실패 횟수를 교체해요. 최초 요청의 경쟁은 `uk_email_verification_email` unique가 막으며 메일 전 DB flush를 수행해요.
- MySQL 잠금 충돌은 서비스 트랜잭션이 롤백된 뒤 이메일 API에서 429·1초 재시도 안내로 처리해요. 내부 SQL·이메일·가입 증명은 응답에 복사하지 않아요. 코드 대조를 자동 재시도해서 실패 횟수를 늘리지 않아요.
- 코드 대조 실패는 5회까지 누적하며 예외가 나도 커밋해요. 실패·재발송·가입 소비는 이메일 행의 `PESSIMISTIC_WRITE` 잠금을 공유해요. IP·계정 요청 제한은 유지해요.
- 코드 확인 성공 시 32바이트 난수의 가입 증명을 반환하고 DB에는 SHA-256 해시만 저장해요. 이메일의 인증 완료 여부만으로는 가입할 수 없으며, 해시는 일정 시간 비교로 확인해요.
- 비밀번호 검토·해시 계산 후 원래 만료 시각과 증명을 다시 확인해요. 인증 삭제·회원 생성·동의 기록은 가입 트랜잭션 하나로 처리하며, 가입 저장 실패 시 인증 소비도 롤백돼요. 소비 API는 외부 가입 트랜잭션 없이 실행할 수 없어요.
- 응답은 공통 `ApiResponse.data`에 `expiresAt`·`verificationTicket`를 담고 `Cache-Control: no-store`를 사용해요. 증명·코드는 URL·로그·브라우저 저장소에 남기지 않아요. 미완료 이메일·만료 시각만 복원하며 새로고침 후에는 다시 인증해야 해요.
- 프론트는 인증 성공 뒤에도 원래 만료 타이머를 유지해요. 탭 복귀와 가입 제출 시 실제 시각을 다시 확인하고, 이메일이 바뀌거나 이전 발송의 늦은 응답이면 인증 상태로 사용하지 않아요. 가입 화면을 떠난 뒤 도착하는 응답으로 타이머·알림·가입 증명을 다시 만들지 않아요.

[수동 DDL 13절](manual-ddl.md#13-가입-이메일-인증-증명unique-2026-10-09-운영-ddl-적용)의 해시 컬럼과 unique는 2026-10-09 승인된 첫 전환에서 실제 운영에 적용했어요. 기존 인증 행을 보존하고 중복 0을 확인했으며 최종 JAR의 제한 계정 `validate`를 통과했어요. 가입의 MySQL 동시 최초 발송·실패 누적·한 번 소비·가입 실패 롤백/원래 만료·만료/오류 증명 미소비는 별도 격리 합성 DB의 검사 **5개·실패 0·skip 0**으로 확인했어요. 같은 최종 SHA의 프론트·백엔드를 함께 전환하며, 구 가입 화면은 새 화면에서 다시 발송·인증해야 해요. 실제 운영 계정 생성이나 이메일 발송은 이 검증을 위해 실행하지 않았어요.

## 세션 무효화

Member의 `auth_version`을 JWT claim에 넣어 기존 access JWT까지 끊어요.

1. 로그인 시 현재 `auth_version`을 access/refresh JWT에 넣어요.
2. 비밀번호 변경·재설정 성공 시 회원 행 잠금 안에서 버전을 올려요.
3. 해당 회원의 refresh token 행을 모두 지워요.
4. 인증 필터가 매 요청 읽는 회원 행에서 JWT 버전과 DB 버전을 비교해요.
5. 버전이 다른 access JWT는 서명이 유효해도 거부해요.

- claim이 없는 JWT는 버전 0으로 읽어요. 회원 DB 기본값도 0이에요.
- 로그인 중 변경 응답은 access/refresh HttpOnly 쿠키를 지우고 로그인 화면으로 보내요.
- JWT의 `purpose` claim(`ACCESS`/`REFRESH`)으로 용도를 나눠요. 인증 필터는 `ACCESS`만, refresh 관문은 `REFRESH`만 받아요. claim이 없는 refresh는 허용해요.

## 로그인 유지 — refresh 회전

refresh할 때마다 refresh 토큰도 새로 발급해 같은 DB 행을 갱신하고 쿠키를 다시 심어요. 유효 기간은 마지막 사용으로부터 14일이에요. 기기당 행 하나, 회원당 최대 5개이고, 넘치면 만료가 가장 이른 기기부터 정리돼요.

| 제시된 토큰 | 처리 |
|---|---|
| 행의 현재 토큰 | 새 refresh로 회전 + 새 access. `previous_token_hash`=이전 토큰 SHA-256, `rotated_at`=지금 |
| 직전 토큰, 회전 후 60초 이내 | 다시 회전하지 않고 현재 refresh + 새 access |
| 직전 토큰, 60초 지남 | 재사용 탐지 → 그 기기 행 삭제 → 401 |
| 그 밖(DB에 없음·만료·세대 불일치·탈퇴) | 401 |

- 행 조회는 2단계예요. 토큰(또는 직전 해시)으로 id만 잠금 없이 읽고, 그 한 행만 `FOR UPDATE`로 다시 읽어 판단해요.
- 모든 JWT에 `jti`(UUID)를 넣어요.
- 거절 전에 지운 행은 401을 던져도 롤백하지 않아요(`@Transactional(noRollbackFor = RefreshRejectedException.class)`).
- 로그아웃은 현재 토큰이든 직전 토큰이든 그 기기 행을 지워요.
- 정지 기간이 끝난 회원의 자동 해제는 refresh 때 해요.
- 프론트는 탭 하나 안에서 refresh를 한 번만 보내요(`api/axios.js`의 `refreshFlight`).

응답은 사유와 관계없이 같은 401·같은 문구예요. 사유는 `Refresh rejected: reason=<사유>, memberId=<id>` 로그로만 남기고 토큰은 남기지 않아요. 사유 목록과 조회 쿼리는 [모니터링](monitoring.md)의 "로그인 유지(refresh) 거절 사유 관측 쿼리"에 있어요.

## 약관과 마케팅 동의 기록

`/api/auth/agree-terms`는 인증이 필요해요. 현재 상태는 `member.marketing_agreed`, 변경 기록은 append-only `marketing_consent_history`에 남겨요.

| 컬럼 | 내용 |
|---|---|
| `agreed` | 동의/철회 값 |
| `source` | `LOCAL_SIGNUP`, `SOCIAL_SIGNUP`, `SETTINGS` |
| `policy_version` | 동의한 정책 버전 |
| `created_at` | 서버 기록 시각 |

개인정보 처리방침을 개정하면 문서 날짜와 `CURRENT_POLICY_VERSION`을 함께 올려요.
이번 고객 웨이팅 고지 초안은 두 값을 `2026-10-08`로 맞췄어요. 기존 동의 이력은 수정하지 않으며, 이 초안 날짜를 실제 운영 게시 시각으로 대신 사용하지 않아요.

## OAuth 연동 해제 outbox

회원 비식별화와 같은 트랜잭션에서 `oauth_unlink_task`를 저장하고, Google/Naver/Kakao 호출은 스케줄러가 처리해요.

| 상태 | 의미 |
|---|---|
| `PENDING` | 실행 대기 |
| `FAILED` | 지수 backoff 후 자동 재시도 |
| `PROCESSING` | 한 실행기가 짧은 lease로 외부 호출 중. 1분 안에 끝나지 않으면 재회수 |
| `BLOCKED` | 제공자 access token이 없어 수동 확인 필요 |
| `COMPLETED` | 해제 완료, 암호문 즉시 NULL |

- claim과 결과 반영만 각각 짧은 새 트랜잭션에서 행을 잠그고, 제공자 HTTP 호출은 트랜잭션 밖에서 해요.
- lease ID가 다른 늦은 결과는 무시해요.
- 운영 감시는 `OAuth unlink queue requires attention` 집계 로그를 써요.

access token은 `OAuthUnlinkTokenCipher`가 AES-GCM으로 암호화해요.

| 이름 | 용도 |
|---|---|
| `OAUTH_UNLINK_ENCRYPTION_KEY` (`oauth.unlink.encryption-key`) | OAuth 해제 토큰 암호화 키. 비어 있으면 JWT secret에서 유도한 키를 써요 |
