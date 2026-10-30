# 예약 입장 부하 실험

이 코드는 격리된 합성 fixture에서만 실행하는 k6 입력과 안전 runner다. 서버·PG·메일·소셜 로그인·운영 설정을 준비하지 않는다. k6 설치, 실제 fixture 기동과 원자성 검증은 별도 확인 범위다.

[ReservationAdmissionLoadFixtureTest](../../backend/src/test/java/kr/it/reserve/reservation/admission/ReservationAdmissionLoadFixtureTest.java)는 명시적으로 활성화하는 테스트 전용 HTTP fixture다. 애플리케이션을 loopback에만 바인딩하고 전용 loopback MySQL과 자신이 생성·종료하는 메모리 Redis를 사용한다. 합성 계정의 임시 보호 파일과 테스트 전용 identity 응답이 일치할 때 세 프로필을 실행하며, rate limit 정책과 PG·메일·파일 저장의 외부 효과는 제외한다. 부하 집계의 임시 목표와 별도로 JDBC에서 실제 예약 정원·요청 멱등성·결제 행 부재를 확인하고, 자신이 만든 Redis와 임시 인증 입력을 정리한다.

## 실행 관문

runner는 명시적인 --run-synthetic-load, 보호된 fixture attestation, 사전 발급 합성 계정 쿠키, 실제 서버 identity 응답의 일치를 모두 요구한다. 기본 대상은 http://127.0.0.1:18080이다. 허용 주소는 http://127.0.0.1:1024~65535 및 http://[::1]:1024~65535의 정확한 origin뿐이다. production 도메인, localhost DNS 이름, 다른 IP, proxy 경로, URL 자격 정보, redirect는 거부한다.

~~~text
node scripts/load/run-reservation-admission.mjs --run-synthetic-load --fixture <absolute-private-attestation.json> --cookies <absolute-private-cookies.json> --scenario queue-open
~~~

선택 옵션은 --origin, --scenario, --rate, --duration-seconds, --vus다. 기본값은 2 arrivals/s, 15초, VU 10개이며 상한은 50 arrivals/s, 120초, VU 100개다. VU 증가로 dropped iterations를 숨기지 않으며 계정 수는 지정한 VU 수 이상이어야 한다. 모든 계정은 서로 다른 사전 발급 access_token을 사용해야 한다. 로그인·비밀번호·refresh·메일 인증 호출을 만들지 않는다.

사전 JSON 두 파일은 절대 로컬 경로의 일반 파일이어야 한다. symlink/reparse·UNC 경로는 거부한다. Linux에서는 현재 사용자 소유 및 0600 수준 권한, Windows에서는 현재 사용자/SYSTEM/Administrators 외 Allow ACL이 없는 고정 디스크 파일을 요구한다. 권한을 자동 변경하지 않는다. 파일은 프로세스 안에서만 읽고 쿠키를 argv·결과·원문 로그로 출력하지 않는다.

실제 identity 경로는 GET /__reserve_load_fixture__/identity로 고정된다. production 경로에 추가하지 말고 test fixture에만 제공해야 한다. 현재 서비스에 이 경로가 없으면 runner는 항상 거부한다. identity 응답은 attestation의 identity와 정확히 같아야 한다.

~~~json
{
  "schemaVersion": 1,
  "identity": {
    "schemaVersion": 1,
    "kind": "reserve-reservation-admission-synthetic-v1",
    "fixtureId": "6c3c8310-2915-43a0-9e22-aa5ab0f9f10e",
    "nonce": "176c1885-63e2-4a71-86eb-a2edeb6c04fd",
    "origin": "http://127.0.0.1:18080",
    "issuedAt": "2026-10-23T00:00:00.000Z",
    "expiresAt": "2026-10-23T00:10:00.000Z",
    "database": "disposable",
    "redis": "disposable",
    "paymentProvider": "disabled",
    "externalEffects": "blocked",
    "syntheticAccountsOnly": true,
    "storeId": 900000001,
    "campaignId": "synthetic-load-fixture",
    "reservationDate": "2026-10-24",
    "reservationTime": "12:00",
    "guestCount": 1,
    "slotCapacity": 10
  }
}
~~~

identity endpoint는 위 예제의 identity 내부 객체를 반환한다. fixtureId/nonce와 시각은 fixture마다 새로 생성해야 하며 예제는 실행 입력이 아니다. identity 유효기간은 최대 15분, 실험 종료와 대기·정리 시간을 포함할 만큼 남아 있어야 한다. 문자열 일치는 실제 데이터베이스·Redis 격리나 외부 효과 차단을 증명하지 않는다. fixture가 해당 격리를 실제로 구성·확인한 뒤에만 attestation을 발급해야 한다.

쿠키 파일은 schemaVersion:1, purpose:reserve-reservation-admission-synthetic-v1, 동일 fixtureId/nonce/origin/expiresAt, accounts 배열을 갖는다. 각 account는 synthetic:true와 cookies 객체의 access_token 한 개만 갖는다. 실제 값·발급 파일은 저장소 밖에 둔다. runner는 Node에서 권한과 SHA-256을 확인하고 k6가 읽은 원문 해시도 다시 비교한다.

자식 프로세스는 고정 k6 run과 고정 빈 로컬 config만 사용한다. 상속된 K6 cloud/output/debug 및 proxy 환경을 넘기지 않고 사용 보고를 끈다. 원격 모듈을 가져오지 않는다. raw stdout/stderr는 출력하지 않으며 고정 집계 JSON summary 한 개만 허용 목록으로 투영한다. 직접 k6 실행에는 runner 확인 표식이 없어 거부된다.

## 세 가지 독립 실험

| scenario | 수행 범위 |
|---|---|
| queue-open | 오픈 전후 GET campaign → join → 4초 간격 status → ADMITTED 또는 제한 시간 → ticket DELETE |
| queue-status | setup에서 VU별 합성 ticket 발급, 고정 arrival rate로 status 조회, account별 최소 4초 간격 유지, 종료 후 ticket DELETE |
| booking-idempotency | VU별 한 개 request UUID/동일 payload를 유지하고 동일 예약 POST 두 개를 병렬 제출, 두 응답 및 후속 재생의 같은 예약 ID 확인 |

한 번에 하나의 scenario만 실행한다. fixture는 각 실험 전에 새 상태를 준비해야 한다. queue-open은 오픈 시각이 시작 직전 60초~시작 후 15초 안에 있는 캠페인을 요구한다. 다른 실험은 캠페인이 열려 있어야 한다. root의 실제 Redis 원자성·정원 초과 방지와 MySQL 동시성·멱등성 검사가 별도로 필요하다.

실험은 예약·입장 API만 호출한다. 예약 payload는 fixture의 store/date/time, guestCount:1, specialRequest:null, skipPayment:false, 고정 requestId/admissionTicket이다. 결제·환불·메일·소셜 API 경로는 제공하지 않는다. 사전 인증 쿠키와 same-origin 요청 메타데이터를 사용하므로 브라우저 CSRF·로그인 E2E 검사를 대체하지 않는다. 기존 rate limit을 우회하는 IP 헤더를 만들지 않으며 429를 오류로 집계한다.

## 집계 해석

join/status/booking/동일 요청 쌍 및 queue wait의 p95/p99, HTTP·예상 외 응답 오류율, 요청/완료 iteration/확인된 예약 쌍의 처리율, dropped iterations를 분리한다. 409 예약 거부, FULL/NOT_OPEN/CLOSED 등 정상 업무 상태, 미확인 멱등성 쌍은 별도 수치다. 입장 대기 시간이 끝나도 입장하지 못한 경우 queue_wait_censored로 남기며 빠른 대기 시간 표본으로 바꾸지 않는다.

HTTP p95 500ms/p99 1000ms, 예상 외 오류율 1% 미만, queue wait p95 20초는 측정 전 임시 실험 목표다. 합의된 서비스 SLO나 운영 용량 보장이 아니다. dropped=0, 동일 요청 ID 불일치=0, fixture 정원 이내 관측값은 측정 품질·정합성 관문으로 유지한다.

충분한 완료 표본이 없거나 dropped 값을 수집하지 못하면 INCOMPLETE다. 대기/예약 표본이 없는 실행을 부하 통과로 바꾸지 않는다. k6 미설치·identity 누락·보호 파일 불충족도 성공으로 표시하지 않는다. 실행 시도 뒤 결과가 유실된 경우 executed:null로 실제 실행 여부가 불명임을 남긴다.

summary는 stdout JSON이며 보고서 파일을 만들지 않는다. productionCapacityProven, databaseInvariantsProven, redisAtomicityProven은 항상 false다. fixture의 실제 초기화·정리와 서버 권한은 이 runner가 수행하지 않는다.

코드는 [k6 constant arrival rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/), [request params](https://grafana.com/docs/k6/latest/javascript-api/k6-http/params/), [custom summary](https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/) 계약을 사용한다.
