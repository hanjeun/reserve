# 계정·비밀번호 보안 계약

> v2.6.1 기준(2026-09-26). 프리뷰(`local-preview-all-changes`)의 계정 보안 변경을 dev로 옮기면서
> 로그인 유지(refresh 회전)를 더했다. 운영 DB 구조 확인은 [수동 DDL 런북](manual-ddl.md) 3장.

## 비밀번호 진입점

회원가입·재설정·변경은 `PasswordPolicy`를 공통 정본으로 사용한다.

| 규칙 | 값 |
|---|---|
| 문자 수 | 8~64자 |
| 조합 | ASCII 영문 1자 이상 + 숫자 1자 이상 |
| bcrypt 입력 | UTF-8 72바이트 이하 |
| 유출 비밀번호 | 기존 `PwnedPasswordChecker`로 거부 |

프론트 검증은 빠른 안내이고 서버 정책이 최종 관문이다. DTO의 Bean Validation과 서비스의
`PasswordPolicy` 검사를 함께 두어 직접 API 호출과 서비스 내부 호출을 모두 막는다.

| 동작 | 엔드포인트 | 추가 조건 |
|---|---|---|
| 회원가입 | `POST /api/auth/signup` | 비밀번호 확인·필수 약관·이메일 인증 |
| 비밀번호 재설정 | `POST /api/password-reset/reset` | 6자리 코드 검증 완료·시도 제한 |
| 로그인 중 변경 | `PUT /api/member/password` | **현재 비밀번호 재인증**·기존 비밀번호와 다름 |

일반 프로필 수정 DTO에는 비밀번호 필드가 없다. 비밀번호 변경은 전용 엔드포인트를 우회할 수 없다.

## 모든 세션 즉시 무효화

refresh token 삭제만으로는 이미 발급된 access JWT가 만료 전까지 살아 있다. 이를 막기 위해 Member의
`auth_version`을 JWT claim에 넣는다.

1. 로그인 시 현재 `auth_version`을 access/refresh JWT에 넣는다.
2. 비밀번호 변경·재설정 성공 시 회원 행 잠금 안에서 버전을 증가시킨다.
3. 해당 회원의 refresh token 행을 모두 삭제한다.
4. 인증 필터는 원래도 매 요청 활성 회원 행을 읽으므로 추가 조회 없이 JWT 버전과 DB 버전을 비교한다.
5. 버전이 다른 기존 access JWT는 서명이 유효해도 즉시 거부한다.

구버전 JWT에는 claim이 없으므로 버전 0으로 읽어 무중단 배포한다. 기존 회원의 DB 기본값도 0이다.
로그인 중 변경 응답은 현재 브라우저의 access/refresh HttpOnly 쿠키도 삭제하고, 화면은 로그인으로 보낸다.

토큰 용도도 나눈다. access와 refresh는 같은 키로 서명하므로 `purpose` claim(`ACCESS`/`REFRESH`)이 없으면
refresh를 Bearer access처럼 쓸 수 있었다. 인증 필터는 `ACCESS`만, refresh 관문은 `REFRESH`(배포 전 발급된
무claim refresh는 호환상 허용)만 받는다.

## 로그인 유지 — refresh 회전

**예전 동작(≤ v2.6.0).** `/api/auth/refresh`는 access만 새로 주고 refresh 토큰·쿠키는 로그인 때 것을
그대로 두었다. 그래서 매일 쓰는 사람도 **로그인 14일째에 무조건** 로그아웃됐다(쿠키 Max-Age와 DB
`expires_at`이 둘 다 로그인 시각 기준). 배포와 같은 날에 겹치면 "배포하면 로그인이 풀린다"로 보였다.

**지금(v2.6.1).** refresh할 때마다 refresh 토큰도 새로 발급해 **같은 DB 행을 갱신**하고, refresh 쿠키를
다시 심는다. 14일은 "마지막 사용으로부터 14일"이 된다(sliding). 기기당 행 하나, 회원당 최대 5개는
그대로다 — 초과하면 가장 오래 안 쓴(만료가 가장 이른) 기기부터 정리된다.

| 제시된 토큰 | 처리 |
|---|---|
| 행의 현재 토큰 | 새 refresh로 회전 + 새 access. `previous_token_hash`=이전 토큰 SHA-256, `rotated_at`=지금 |
| 직전 토큰, 회전 후 60초 이내 | 다시 회전하지 않고 **현재** refresh + 새 access. 탭 여러 개·재시도가 동시에 오는 경우 |
| 직전 토큰, 60초 지남 | 재사용 탐지 → 그 기기 행 삭제(양쪽 모두 끊는다) → 401 |
| 그 밖(DB에 없음·만료·세대 불일치·탈퇴) | 401 |

구현 경계:

- 행 조회는 2단계다. 먼저 토큰(또는 직전 해시)으로 **id만** 잠금 없이 읽고, 그 id 한 행만 `FOR UPDATE`로
  다시 읽는다. `refresh_token` 컬럼은 TEXT라 인덱스가 없어서, 거기에 바로 `FOR UPDATE`를 걸면 InnoDB가 훑은
  행 전부를 잠근다. 잠금을 기다리는 사이 다른 요청이 회전했으면 잠긴 뒤의 값으로 다시 판단한다.
- 모든 JWT에 `jti`(UUID)를 넣는다. iat가 초 단위라 같은 초에 발급한 토큰은 문자열까지 같아질 수 있었다.
- 거절 전에 지운 행(재사용·만료·세대 불일치)은 401을 던져도 롤백하지 않는다
  (`@Transactional(noRollbackFor = RefreshRejectedException.class)`).
- 로그아웃은 현재 토큰이든 직전 토큰이든 그 기기 행을 지운다.
- 정지 기간이 끝난 회원의 자동 해제는 예전처럼 refresh 때 한다.
- 프론트는 바꾼 게 없다. 탭 하나 안에서는 refresh를 한 번만 보낸다(`api/axios.js`의 `refreshFlight`).
- **탭을 여러 개 열어 두는 것만으로는 재사용 판정이 나지 않는다.** 쿠키는 브라우저 단위라 탭끼리 공유되므로,
  한 탭이 회전하면 다른 탭도 다음 요청부터 새 토큰을 보낸다(몇 분·몇 시간 뒤여도 같다). 직전 토큰이 오는 건
  회전 순간에 이미 출발해 있던 요청(여러 탭이 동시에 401을 받은 경우)뿐이고, 60초 유예는 그걸 흡수한다.
  정상 사용자가 `REUSED_TOKEN`에 걸리는 건 회전 응답을 받기 직전에 연결이 끊겨 새 쿠키를 못 받은 같은
  드문 경우다. 모니터링에서 자주 보이면 유예를 다시 검토한다.

**거절 사유 로그.** 응답은 사유와 무관하게 같은 401·같은 문구다. 사유는
`Refresh rejected: reason=<사유>, memberId=<id>` 로그로만 남기고 토큰은 남기지 않는다. 사유 목록과 Loki
조회는 [모니터링](monitoring.md)의 "로그인 유지(refresh) 거절 사유 관측 쿼리".

**배포 호환.** 배포 전에 발급된 refresh는 처음 refresh할 때 그대로 회전되므로 자동 로그아웃은 없다.
Blue/Green 전환 중 구버전이 요청을 받아도 구버전은 행의 현재 토큰으로 조회하므로 동작한다.
단, 배포 전에 이미 로그인 14일째를 넘긴 쿠키는 브라우저가 지웠으므로 한 번은 다시 로그인해야 한다.

## 약관과 마케팅 동의 증거

`/api/auth/agree-terms`는 OAuth 로그인 직후 회원 상태를 바꾸는 API이므로 인증이 필수다.
현재 상태는 `member.marketing_agreed`, 변경 증거는 append-only `marketing_consent_history`에 남긴다.

- `agreed`: 동의/철회 값
- `source`: `LOCAL_SIGNUP`, `SOCIAL_SIGNUP`, `SETTINGS`
- `policy_version`: 동의한 정책 버전
- `created_at`: 서버 기록 시각

개인정보 처리방침을 개정하면 문서 날짜와 `CURRENT_POLICY_VERSION`을 함께 올린다.

## OAuth 탈퇴 연동 해제 outbox

회원 비식별화와 같은 트랜잭션에서 `oauth_unlink_task`를 먼저 저장한다. 외부 Google/Naver/Kakao 호출은
스케줄러가 처리하므로 DB 커밋 직후 프로세스가 종료되어도 의도가 사라지지 않는다.

| 상태 | 의미 |
|---|---|
| `PENDING` | 실행 대기 |
| `FAILED` | 지수 backoff 후 자동 재시도 |
| `PROCESSING` | 짧은 lease로 한 실행기가 외부 호출을 수행 중. 1분 안에 끝나지 않으면 재회수 |
| `BLOCKED` | 탈퇴 시 제공자 access token이 없어 수동 확인 필요 |
| `COMPLETED` | 제공자 해제 완료, 암호문 즉시 NULL 처리 |

access token은 AES-GCM 암호화한다. `OAuthUnlinkTokenCipher`는 `oauth.unlink.encryption-key`
(`OAUTH_UNLINK_ENCRYPTION_KEY`)가 비어 있으면 JWT secret에 목적 문자열을 더해 유도한 키를 사용한다.
**v2.6.1 운영은 이 유도 키 상태다.** compose·CI에는 별도 키 배선이 아직 없다 — 별도 키로 바꾸려면
`docker-compose-blue/green.yml`의 environment와 `CICD.yml`의 `envs`에 함께 넣고, 아래 교체 주의를 따른다.
JWT 키를 교체할 때도 이 키가 비어 있다면 같은 주의가 필요하다.
JWT 키와 별도인 충분히 긴 무작위 키를 사용하는 것이 목표다. fallback으로 저장한 기존
`PENDING/FAILED/PROCESSING` 작업은 새 키로 복호화되지 않을 수 있으므로 즉시 교체/시작 실패 강제는 하지 않는다.
기존 작업의 처리 완료 또는 검증된 재암호화/키 전환 절차를 먼저 확보한다. 키 값은 출력하지 않는다.
운영 감시는 `OAuth unlink queue requires attention` 집계 로그를 쓴다.

claim과 결과 반영만 각각 짧은 새 트랜잭션에서 행 잠금을 잡는다. 제공자 HTTP 호출은 트랜잭션 밖에서
실행해 DB 연결을 붙들지 않는다. lease가 만료돼 다른 실행기가 회수하면 이전 실행기의 늦은 결과는
lease ID가 달라 무시된다.

## 배포 전 확인

- `member.auth_version`의 기본값·NOT NULL과 기존 행 0을 확인한다.
- `refresh_token.previous_token_hash`·`rotated_at`과 `idx_refresh_token_previous_hash`를 확인한다.
- `marketing_consent_history`의 회원/시각 인덱스를 확인한다.
- `oauth_unlink_task`의 task key unique와 status/next_attempt_at 인덱스를 확인한다.
  (위 네 줄은 `scripts/verify-post-deploy-readonly.sh`가 한 번에 본다.)
- Grafana 알림 8번 쿼리를 `OAuth unlink queue requires attention`으로 바꾼다(예전 문구는 더 안 나온다).
- 배포 후 한 기기에서 30분 이상 지나 화면을 열어 `Refresh rotated` 로그와 refresh 쿠키 갱신을 확인한다.
- TEST OAuth 계정으로 탈퇴 후 제공자 콘솔에서 연동 해제를 확인한다.
- 실패와 토큰 누락을 각각 만들어 `FAILED → COMPLETED`, `BLOCKED → 운영 알림`을 확인한다.

## 계획 — 새 환경 로그인과 세션 보호

> 이 절은 설계 단계다. 현재 로그인은 계정·IP 기준 시도 제한, 비밀번호 검증 뒤의 제재 확인,
> 최대 개수 refresh token 보관, refresh 회전·직전 토큰 재사용 탐지(v2.6.1)를 수행하지만
> 새 기기 알림·IP 국가 판정·세션 목록·MFA는 아직 구현하지 않았다.

VPN, 이동통신망, 사무실 NAT, 여행 때문에 IP는 자주 바뀐다. 따라서 "새 IP", "한국 밖 IP", "VPN" 하나만으로
로그인을 차단하지 않는다. 해외 서비스로 확장해도 유지될 수 있도록 IP·국가·ASN·기기 정보는 여러 위험 신호 중
하나로만 쓰고, 실제 차단·추가 인증은 결합된 위험도에만 적용한다.

### 도입 순서

1. **감사 전용 수집** — 새 `account_session`/세션 이벤트에 회원, 세션 식별자, 생성·마지막 활동·만료·폐기 시각,
   표시용 기기 이름, 위험도 결과만 남긴다. 장기 저장 IP는 원문 대신 최소화한 prefix 또는 회전 키 HMAC으로 보관하고,
   국가·ASN은 로그인 시점의 신호로만 쓴다. 이 단계에서는 차단하지 않고 오탐을 측정한다.
2. **사용자 통제** — 보안 센터에서 최근 로그인 기기·대략적 지역·시각을 보여 주고, 선택 세션 또는 모든 다른 세션을
   폐기할 수 있게 한다. 새 기기 로그인은 이메일과 보안 센터에 알리되 원문 IP·정확한 위치를 노출하지 않는다.
3. **위험 기반 추가 인증** — 새 기기와 짧은 시간의 불가능한 이동, 반복 비밀번호 실패, 비밀번호 재설정 직후,
   고위험 ASN 같은 신호가 함께 있을 때만 이메일 OTP나 패스키/TOTP로 추가 인증한다. 결제·환불·비밀번호·이메일·보안
   설정 변경에는 최근 인증 여부를 별도로 요구한다.
4. **국가별 정책과 MFA 선택권** — 해외 진출 시 허용 국가를 코드에 고정하지 않는다. 운영 설정과 위험 공급자 품질,
   지역별 사용자 지원 절차를 검토해 단계적으로 바꾸며, 선택 MFA부터 강제 MFA로 갈지 사용자 영향과 오탐 자료를
   보고 결정한다.

### 구현 전 결정할 것

- refresh token 원문을 새 세션 행에 다시 저장하지 않고 가족(family) 식별자와 검증용 digest를 쓸지
- IP·기기·지역 신호의 보존 기간, 열람 권한, 개인정보 처리방침의 수집 목적과 고지 문구
- 신규 기기 통지 채널(이메일 우선)과 전달 실패 시 행동
- 위험도 공급자 장애 때의 fail-open/fail-step-up 정책 및 수동 복구 경로
- 세션 폐기, 패스키/TOTP 도입을 기존 refresh 회전(행 = 기기)과 하나의 마이그레이션·회귀 테스트 묶음으로
  검증할 방법. 현재 재사용 탐지는 직전 한 세대만 본다(두 세대 이상 지난 토큰은 `UNKNOWN_TOKEN`).
