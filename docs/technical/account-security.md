# 계정·비밀번호 보안 계약

비밀번호 정책, 세션 무효화, 로그인 유지(refresh 회전), 동의 기록, OAuth 연동 해제의 계약을 정리해요. 운영 DB 구조 확인은 [수동 DDL 런북](manual-ddl.md) 3장을 보세요.


## 2026-10-18 운영 상태

v2.12.0에서 DDL 16절과 활성 OAuth 토큰 암호화를 운영에 적용했어요. 독립 키를 운영·향후 CI·보호된 v7 복구 입력에 보존하고 새 정상 저장부터 AES-GCM으로 보호해요. 기존 평문 토큰의 일괄 재저장은 수행하지 않았어요. 암호문 저장 뒤에는 flag를 끄거나 키를 제거해 복구하지 않아요.

Google·카카오·네이버의 공급자 역방향 알림 수신은 운영과 향후 배포 변수 모두 꺼 둔 상태예요. 로그인 시작에서 새 앱 콜백으로 이동하는 경로를 확인했고, 전환 후 사용자가 실제 로그인·휴대폰 사용이 정상이라고 확인했어요. 공개 계정·피드 프로필의 두 CloudFront 경로에는 TTL 0을 적용했고 기존 객체 2개의 no-store 메타데이터·캐시 무효화·실제 HTTPS no-store 응답을 확인했어요. 이미 사용자의 브라우저에 내려받은 사본을 강제 회수하는 것은 아니에요. 아래 ‘후보·운영 미적용’ 설명은 이 전환 전 준비 기록이에요. [실제 전환 기록](deployments.md#2026-10-18-v2120-실제-운영-전환)을 봐요.

같은 날 사용자가 Google RISC 약관에 직접 동의해 `reserve-494004` 프로젝트의 API 사용 설정을 완료했고 콘솔의 ‘사용 설정됨’을 확인했어요. 전용 서비스 계정·최소 IAM 권한·수신 스트림 등록과 공급자 실제 왕복은 아직 준비 단계예요. 기존 Gemini 서비스 계정을 재사용하거나 권한을 추가하지 않았으며 앱 수신 설정도 계속 false예요. API 활성화를 사건 수신 완료로 보지 않아요.

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

### 만료 인증 자료 정리 — 로컬 후속 후보

`ExpiredVerificationCleanupScheduler`가 매일 서버 시각 04:20에 만료된 가입 이메일 인증·비밀번호 재설정 행만 삭제해요. 발급·검증과 같은 서버 기본 시간대를 사용하므로 UTC 서버에서는 한국 시각 13:20이에요. 만료되지 않은 코드·가입 증명은 유지하고 삭제 수만 기록해요. OAuth 사건의 중복·재생 방지 행에는 이 정리를 적용하지 않아요. 만료/유효 행 분리와 가입 증명 보존은 격리 DB 표적 검사로 확인했으며 운영 배포·실제 정리 실행은 하지 않았어요.

### 관리자 제재 관문 — 로컬 후속 후보

`AdminSanctionService`에도 `hasRole('ADMIN')`을 강제해 컨트롤러를 우회한 서비스 호출부터 거절해요. 일반·사업자 역할은 DB 조회·제재·감사 쓰기 전에 차단하고 관리자의 기존 유효성 검사는 유지해요. JWT 필터는 현재 DB 회원의 역할·정지·삭제·인증 버전을 계속 재확인해요. 서비스 경계의 허용/거절 표적 검사를 통과했으며 운영 반영은 별도예요.

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

### JWT 설정과 발급자 검증 — v2.13.0 후보

발급과 검증에 같은 `jwt.issuer`를 사용해요. 공통 파싱 관문은 서명·만료와 발급자를 확인하고, 만료된 refresh 토큰도 발급자가 다르면 회원 식별자를 신뢰하지 않아요. 기존 `reserve` 발급자·서명 키·access/refresh 용도·`jti`·인증 버전·OAuth 원인증 시각은 유지해요.

발급자가 비어 있거나 토큰 수명이 누락·0·음수인 설정은 기동 전에 거부해요. 수명은 분 또는 일 중 하나만 지정해요. 별도 소비자·키 교체 요구가 없는 현재 구조에 `aud`·`kid`·추가 암호화 체계를 임의로 도입하지 않아요.

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

탈퇴 API는 `MemberWithdrawalService`에서 요청 JWT의 원래 인증 문맥을 고정하고 subject→현재 회원 순서로 잠가요. 현재 회원의 공급자/식별자·세대·cutoff를 다시 확인한 뒤 주체에 탈퇴 cutoff를 남기고 기존 거래 보호·사진 삭제 outbox·비식별화를 같은 트랜잭션에서 처리해요. 실패하면 cutoff도 롤백돼요. 탈퇴 전 교환한 공급자 토큰으로 다시 가입하는 것을 막고, 탈퇴 뒤의 새 소셜 인증은 새 가입으로 처리해요. LOCAL 탈퇴에는 주체 행을 만들지 않아요.

기존 일괄 정리 쿼리는 persistence context를 비우므로 마지막 회원 비식별화 전에 같은 트랜잭션에서 회원을 다시 잠금 조회해요. 이 관문이 빠지면 함수가 끝나도 분리된 회원 객체의 탈퇴 시각이 저장되지 않는 것을 격리 MySQL 8.0.45에서 재현했어요. 보완 뒤 실제 회원 행의 탈퇴·옛 인증의 재가입 거부·새 인증의 새 가입과, 후속 실패 시 회원/subject/연결 해제·사진 삭제 outbox의 전체 롤백을 확인했어요. 운영 탈퇴를 실행한 결과는 아니에요.

회원 비식별화와 같은 트랜잭션에서 `oauth_unlink_task`를 저장하고, Google/Naver/Kakao 호출은 스케줄러가 처리해요.

| 상태 | 의미 |
|---|---|
| `PENDING` | 실행 대기 |
| `FAILED` | 지수 backoff 후 자동 재시도 |
| `PROCESSING` | 한 실행기가 짧은 lease로 외부 호출 중. 1분 안에 끝나지 않으면 재회수 |
| `BLOCKED` | 토큰 부재 또는 HTTP 400/401 등 같은 입력의 자동 재시도로 해결하지 못하는 응답. 수동 확인 필요 |
| `COMPLETED` | 해제 완료, 암호문 즉시 NULL |

- claim과 결과 반영만 각각 짧은 새 트랜잭션에서 행을 잠그고, 제공자 HTTP 호출은 트랜잭션 밖에서 해요.
- lease ID가 다른 늦은 결과는 무시해요.
- 운영 감시는 `OAuth unlink queue requires attention` 집계 로그를 써요.

outbox의 access token은 기존 `OAuthUnlinkTokenCipher`가 AES-GCM으로 암호화해요. 2026-10-16 후보는 네이버 해제를 공식 `POST /oauth2.0/revoke`의 form 본문으로 보내 시크릿·토큰을 URL에 넣지 않아요. HTTP 400/401은 영구 실패, 429/5xx·연결 장애는 재시도로 구분해요. 실제 공급자 계정의 호출·콘솔 설정은 변경하지 않았어요. [네이버 공식 해제 명세](https://developers.naver.com/docs/login/api/api.md)

## 활성 OAuth 토큰 암호화 후보 — 운영 미적용

`OAuthProviderTokenConverter`·`OAuthProviderTokenCipher`는 기본 off예요. 활성화할 때는 Base64로 인코딩한 독립 32-byte `OAUTH_PROVIDER_TOKEN_ENCRYPTION_KEY`가 필요하며 JWT·outbox 키와 혼용하지 않아요. 새 저장은 버전 표식·무작위 nonce·목적별 AAD의 AES-GCM envelope이고 기존 평문은 읽을 수 있어요. 기존 토큰을 일괄 재저장하거나 이관하지 않으며 다음 정상 저장부터 암호화해요. 기존 2048자 토큰의 envelope도 들어가도록 [DDL 16절](manual-ddl.md#16-oauth-토큰-보호와-공급자-보안-사건-후보-운영-미적용)의 `TEXT` 확장이 먼저 필요해요.

암호문이 한 건이라도 저장된 뒤에는 flag=false나 키 제거로 되돌릴 수 없어요. 미설정/다른 키·손상·다른 목적의 암호문은 거부하며 토큰을 평문으로 취급해 우회하지 않아요. 복구는 같은 형식을 읽는 실제 JAR·해당 키·DB를 함께 사용해요. 메타데이터 전용 검증 도구의 무인자 Converter는 null만 통과시키고 실제 비NULL 변환은 거부해요. 키가 필요한 실제 앱 주입·복호화와 schema-only 도구를 구분해요. 토큰 원문은 검사 출력·로그·채팅에 남기지 않아요.

## 공급자 보안 사건 수신 후보 — 운영 미적용

Google/Kakao의 서명된 SET 수신 기반을 `POST /api/oauth/events/google`, `/kakao`에 준비했으며 v1 별칭도 있어요. 로그인 Callback URL과 다른 경로예요. 원문 `application/secevent+jwt`를 32KiB+1까지만 읽어 초과를 거절하고, 고정 공식 discovery/JWKS·RS256·kid·issuer·audience 및 공급자별 app/subject/event 규칙을 확인해요. 요청이 지정한 URL·이메일로 신원을 대체하지 않아요. 키 조회는 고정 주소·redirect 금지·timeout·제한 읽기·실패 backoff를 사용해요. Google RISC의 과거 사건에 일반 로그인 JWT의 exp 규칙을 적용하지 않아요. [Google 공식 RISC](https://developers.google.com/identity/protocols/risc), [Kakao 공식 웹훅](https://developers.kakao.com/docs/ko/kakaologin/callback)

`iat`·`toe`는 소수를 허용하는 NumericDate예요. 서명 검증 뒤 원래 payload의 숫자를 읽고 UTC 밀리초로 올림해 DB cutoff를 과거로 낮추지 않아요. JWT 라이브러리의 Date/Long 변환에서 먼저 초 단위로 잘라 버리지 않으며 비수·음수·범위 초과는 거부해요. 밀리초 올림은 앱의 보수적인 비교 정책이고 공급자 규격에 명시된 반올림 규칙으로 설명하지 않아요. [RFC 7519 NumericDate](https://www.rfc-editor.org/rfc/rfc7519#section-2), [RFC 8417 toe](https://www.rfc-editor.org/rfc/rfc8417#section-2.2)

검증한 사건의 provider+사건 ID 해시를 inbox unique로 보관해요. `oauth_subject_security`에는 provider와 subject의 SHA-256 가명 키·인증/폐기 고수위·갱신 시각만 보관해요. 익명화된 자료로 설명하지 않으며 raw SET·subject·이메일·토큰을 이 두 테이블에 저장하지 않아요. 회원·예약·결제 데이터는 삭제하지 않으며 일부 scope·프로필 변경·재활성화를 전체 탈퇴로 해석하지 않아요.

로그인과 사건은 수신 flag와 무관하게 같은 주체 행을 upsert·잠그고 현재 회원을 잠금 조회해요. 다중 주체는 키 순서로 잠근 뒤 inbox·회원·refresh 순서로 처리해요. 사건이 먼저 오면 미가입 주체에도 cutoff가 남아 옛 인증의 가입을 거부하고, 가입 INSERT가 먼저면 사건이 커밋을 기다렸다가 새 회원을 폐기해요. 회원 조회는 MySQL REPEATABLE READ의 과거 스냅샷을 재사용하지 않는 current read예요. `idx_member_oauth_subject(provider, provider_id, deleted_at)` 비고유 인덱스로 다른 주체까지 전체 스캔으로 잠그는 범위를 좁혀요. 기존 중복 주체는 삭제/합치지 않고 로그인에서 거부해요.

`OAuthSessionIssuer`는 공급자 인증 뒤 성공 핸들러가 원래 인증 문맥·만료·버전을 다시 검사하고 access/refresh 쌍을 한 트랜잭션에서 발급하도록 해요. token 교환부터 10분 상한과 공급자 토큰의 만료를 잠금 대기 뒤와 발급 뒤 다시 확인하며 동의 화면 체류 시각으로 대신하지 않아요. `oauth_auth_at`은 UTC epoch milliseconds의 원래 인증 시각이고 refresh·직전 토큰 유예 발급에서도 그대로 유지해요. 현재 회원의 최신 인증 시각이나 새 JWT의 iat로 바꾸지 않아요.

지연 사건도 회원 cutoff를 최댓값으로 남겨 원래 인증이 그 시각 이하인 access/refresh를 거부해요. 사건 이후의 새 재인증이 있으면 그 공급자 토큰·새 세션·authVersion을 보존하고 옛 세션만 cutoff로 차단해요. cutoff가 있는 OAuth 회원의 원인증 claim 없는 구 세션은 다시 로그인해야 해요. 일반 로그인·최대 5기기 정책은 유지해요. refresh는 회원→refresh 순서로 잠그고, 처음 들어온 토큰·직전 토큰 유예·현재 DB 토큰의 문맥을 확인해요.

개인 공통/웨이팅 SSE는 실제 연결 JWT의 원인증 문맥을 캡처해 첫 연결·전송·heartbeat에서 현재 회원 cutoff·버전·삭제/정지·역할을 재검사해요. 과거 연결의 문맥을 최신 회원 시각으로 대체하지 않아요. 무효 세션은 session-ended 후 닫고 DB 일시 오류는 연결만 닫아요. 공개 스트림과 웨이팅의 기존 약관 정책은 유지해요. 이 후보의 소스·표적 검사와 실제 공급자 등록/운영 동작은 구분하며 기본 false를 유지해요.

Naver는 `POST /api/oauth/events/naver`와 v1 별칭에 form 알림을 받아요. 쿼리/본문을 각각 4KiB로 제한하고 중복/초과/잘못된 clientId·MAC·시각을 거부해요. 기존 로그인 Client Secret에서 공식 규격의 raw MD5 16-byte 키를 만들고 HMAC-SHA256을 일정 시간 비교한 뒤에만 AES-CBC 식별자를 복호화해요. 새 시크릿·토큰 URL 전달은 추가하지 않아요. 성공은 본문 없는 204이며 공식 규격상 실패는 재전송되지 않으므로 DB 오류를 성공으로 숨기지 않아요. ±5분은 앱의 재생 방지 정책이며 Naver 필수 규격으로 설명하지 않아요. timestamp가 요청 시각이라 실제 연결 해제·재연결의 정확한 발생 순서를 모두 구분할 수 없는 한계도 있어요. [Naver 공식 연결 해제 알림](https://developers.naver.com/docs/login/devguide/devguide.md#4-4-네이버-로그인-연결-끊기-알림-받기)

활성화 전에는 최종 후보의 계정/원인증/실제 MySQL 경합 검사와 새 전체 JAR 검증, 공급자별 프로젝트/동의/스트림 등록·실제 왕복·실패 관측을 확인해요. 보관기간/재전송 유효기간·중복 해시 파기 정책도 후속이며, 재생 방지 행을 시각만으로 지우면 오래된 SET를 다시 받을 수 있으므로 임의 자동 삭제는 추가하지 않았어요. 기존 회원의 인증 시각을 추정해 백필하지 않아요.

| 이름 | 용도 |
|---|---|
| `OAUTH_UNLINK_ENCRYPTION_KEY` (`oauth.unlink.encryption-key`) | OAuth 해제 토큰 암호화 키. 비어 있으면 JWT secret에서 유도한 키를 써요 |
| `OAUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED` / `OAUTH_PROVIDER_TOKEN_ENCRYPTION_KEY` | 활성 토큰 암호화 off/전용 키. 암호문 저장 뒤 임의 off·교체 금지 |
| `OAUTH_SECURITY_EVENTS_GOOGLE_ENABLED` / `OAUTH_SECURITY_EVENTS_KAKAO_ENABLED` / `OAUTH_SECURITY_EVENTS_NAVER_ENABLED` | 기본 false. 최종 검증·공급자 등록·운영 승인 뒤 별도로 활성화 |
| `KAKAO_APP_ID` | 향후 서명 사건의 app_id 검증. 대표 REST API 키·로그인 client ID와 구분 |

전용 키는 Actions Secrets → SSH → Blue/Green Compose로 전달하도록 준비했어요. 기존 outbox 키의 Actions Secret이 없을 때는 빈 export가 서버의 보호된 `.env` 키를 가리지 않도록 unset해요. 실제 Secret·서버 설정·운영 키 생성/교체는 하지 않았어요.

## 공개 프로필 사진과 CDN 캐시

일반 계정·별도 피드 프로필 사진은 관리되는 공개 이미지 경로를 사용해요. 교체·탈퇴 시 소유 경로의 이전 객체를 삭제 outbox로 정리해요. 2026-10-16 후보의 새 `users/{id}/profiles`·`users/{id}/feed/profiles` 업로드는 기존 사업자 인증 사진과 같이 `Cache-Control: no-store`예요. 그 밖의 가게·썸네일·광고·공지·고객지원 공개 사진은 기존 캐시 정책을 유지해요.

2026-10-16 운영 콘솔 읽기에서 `cdn.reserve.it.kr`의 배포 `E1VOAW2W8K0VA4`는 동작이 기본값 `*` 하나이며 `Managed-CachingOptimized`를 사용했어요. 프로필 전용 동작·원본 요청/응답 헤더 정책·함수 연결은 없어요. 이 관리형 정책의 minimum/default/maximum TTL은 1초/86,400초/31,536,000초이고 minimum이 0보다 크면 원본 no-store도 최소기간 동안 캐시해요. [AWS 관리형 정책 명세](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policy-caching-optimized)

운영 보완 후보는 공개 계정·피드 프로필의 `users/*/profiles/*`, `users/*/feed/profiles/*`에만 관리형 `CachingDisabled`(TTL 모두 0)를 연결하는 것이에요. 적용 전 현재 배포 정의/ETag·원본과 접근 설정을 보존하고, 가게·광고 등 기본 동작은 유지해요. 기존에 남아 있는 프로필 객체는 정확한 소유 경로와 메타데이터를 조회한 뒤 no-store로 보완할 대상을 선별하고 기존 캐시 무효화 경로도 함께 확정해요. 새 정책만으로 원본의 옛 `public, max-age=86400`을 브라우저에서 지울 수는 없어요.

이미 업로드한 객체 메타데이터나 브라우저/CDN 캐시는 소급 제거되지 않아요. S3 원본 삭제만으로 이전 URL의 즉시 차단도 보장하지 않으며 이미 내려받은 브라우저 캐시는 서버에서 강제 회수할 수 없어요. 실제 정책·기존 객체·무효화 적용은 대상 확인 뒤 별도 승인이 필요해요. 암호화 피드 본문·댓글 사진의 권한 검사/no-store 경로와 공개 아바타를 구분해요. 이번 작업에서 CDN 설정·운영 객체는 바꾸지 않았어요.
