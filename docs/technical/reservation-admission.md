# 인기 예약 입장 대기

특정 가게의 예약 날짜·시간에만 입장 대기를 적용해요. 기존 현장 웨이팅과는 별도의 기능이에요. 기본값은 꺼짐이며, 운영 Redis와 행사 설정을 준비해야 사용할 수 있어요.

## 설정

`reserve.admission.enabled`로 기능을 켜고 `campaigns`에 아래 값을 설정해요. 같은 가게·날짜·시간에 여러 행사를 겹치게 설정할 수 없어요.

| 값 | 의미 |
|---|---|
| id / epoch | 행사 식별자와 운영자가 지정하는 상태 세대 |
| store-id / date / time | 대상 가게와 예약 날짜·시간 |
| opens-at / closes-at | 입장 접수 기간, UTC 시각 |
| concurrent | 동시에 예약을 진행할 수 있는 인원 |
| lease-seconds | 입장 유효 시간, 기본 180초 |
| idle-seconds | 대기 상태 확인이 끊겼을 때 유예, 기본 90초 |
| max-waiting | 대기열 상한, 기본 10,000명 |
| max-participants | 완료 기록을 포함한 행사 보관 참가자 상한, 기본 100,000명 |

인증된 Redis 연결과 환경별 namespace를 재사용해요. 행사별 설정 해시 marker를 운영자가 별도로 준비해야 하며, marker 누락·불일치·Redis 장애 때 신규 입장을 허용하지 않아요. 데이터 유실 뒤 자동 초기화하지 않아요. 대기 인원과 완료 기록 보관 한도는 별도로 제한하고, 보관 참가자 상한에 도달하면 신규 참가 접수를 종료해요.

[준비 도구](../../scripts/java/kr/it/reserve/tools/PrepareAdmissionCampaign.java)는 해당 릴리스 클래스패스에서 독립 실행하며 Spring 앱이나 worker를 시작하지 않아요. 기본 동작은 설정 확인과 marker 계산뿐이에요. `--apply`를 명시해야 초기화하고, 운영은 `--production`도 필요해요. 전용 Redis 환경변수만 읽고 `noeviction`을 확인하며 기존 상태를 덮어쓰거나 초기화하지 않아요. 재시작·복원 뒤에는 입장 접수를 멈춘 상태에서 저장 상태와 DB 결과를 확인하고 재개 여부를 결정해요.

## 처리 기준

- 회원·행사별 진행 중인 입장권 하나를 사용하고, 새로고침과 중복 탭에서도 같은 입장권을 복구해요.
- 입장 상태는 Redis Lua에서 원자적으로 처리해요. 상태 조회는 서버가 안내하는 간격을 사용해요. 대기 순번 1~10은 4초, 11~100은 10초, 그 뒤는 20초이며 `idle-seconds`의 1/3 이내로 제한해요. 대기 외 상태의 기본 간격은 4초예요. 실측 부하를 자동 판단하는 방식이 아니라 순번·유예 시간에 따른 정책이며, 같은 브라우저의 여러 탭은 조회를 조정해요.
- 예약 API도 회원·행사·입장권을 검사해요. 화면만 건너뛰어서 예약할 수 없어요.
- 입장 허용은 자리 확보가 아니에요. MySQL의 가게 잠금·정원 검사가 예약 여부를 최종 결정해요.
- 같은 회원의 같은 요청 번호는 같은 결과를 돌려줘요. 다른 내용으로 번호를 재사용하면 거부해요.
- DB 커밋 후 Redis 응답이 유실돼도 원래 요청 번호로 결과를 확인할 수 있어요. 실패한 DB 트랜잭션은 예약 결과를 남기지 않아요.
- 예약을 완료한 입장권은 재사용할 수 없어요. 완료 상태가 다른 탭에 남으면 예약 내역 안내와 ‘새 예약 대기’를 표시하며, 명시적으로 새 대기를 시작한 경우에만 새 순번을 받아요. 이전 완료 기록과 요청 번호를 통한 결과 복구는 유지돼요. 처리 중인 요청은 새 대기로 전환하지 않아요.
- 페이지를 돌아오거나 새로고침한 뒤 같은 날짜·시간을 선택하면 서버에 남은 입장 시간을 확인해 안내를 복구해요. 조회만으로 새 순번을 받거나 입장 시간을 늘리지 않아요.
- 기존 예약 조회·결제·취소·변경은 공통 비상 입장 대기에서 보존해요. 변경용 가게·달력·시간표는 본인 소유의 변경 가능한 미결제 예약인지 확인한 뒤 별도 조회하며, 최종 변경 때 권한과 정원을 다시 검사해요.
- 예약 처리의 제한 시간은 30초예요. Redis는 처리 중 최소 60초를 보호하며, 실패해도 원래 입장 기한을 늘려주지 않아요. 입장권은 결제 자격이나 결제 완료를 의미하지 않아요.
- 사용자가 창을 닫으면 입장권을 유지하고, 명시적으로 대기를 취소하면 반환해요. 확인이 끊기면 유예 후 만료돼요.

## 반복 요청 방어

예약 생성은 IP와 회원별로 제한해요. 같은 요청의 커밋 결과는 별도 결과 조회에서 복구해요. 결과 조회와 기존 예약의 변경·취소는 추가 확인을 요구하지 않아요.

`RESERVE_RESERVATION_SHARED_LIMITS_ENABLED`를 켜면 구성된 Redis에서 회원별 생성 한도와 추가 확인 기준을 공유해요. Redis 통신이 실패하면 인스턴스별 제한을 적용해요. 공유 한도를 켜려면 RESERVE Redis 구성이 필요해요.

`RESERVE_RESERVATION_TURNSTILE_ENABLED`를 켜고 `RESERVE_RESERVATION_TURNSTILE_SITE_KEY`, `RESERVE_RESERVATION_TURNSTILE_SECRET_KEY`, `RESERVE_RESERVATION_TURNSTILE_HOSTNAME`을 설정해요. 반복 시도가 기준을 넘으면 예약 생성 API가 428과 확인 정보를 돌려줘요. 브라우저는 이때만 위젯을 불러오고 같은 요청 번호로 재시도해요. 서버가 Siteverify의 호스트·동작·요청 번호를 확인한 뒤 예약 트랜잭션을 시작해요. 제공자 장애 때는 503을 반환해요. 이메일 인증은 계정 확인에 사용해요. [Turnstile 서버 검증](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

운영 CD는 GitHub `production` 환경의 변수와 Turnstile 비밀값을 blue·green 컨테이너에 전달해요. 예약 공유 한도와 Turnstile은 기본값이 꺼짐이에요. 공유 한도를 켜면 제한된 Redis 계정과 준비 상태를 검사하고, Turnstile을 켜면 실제 앱 호스트와 운영 키를 확인한 뒤 컨테이너를 시작해요.

Cloudflare WAF에서 과도한 공개 조회를 제한할 때는 앱 호스트의 가게 목록·지역 조회·검색 GET에만 규칙을 적용하고 검증된 검색엔진을 예외로 둬요. API 제한 응답에는 429를 사용해요. 적용 전 오리진이 신뢰할 프록시와 클라이언트 IP 전달을 확인해요. CDN 캐시는 공개 정적 자산에 적용해요. 공통 비상 입장 정책이 검사하는 API 응답과 예약·입장·개인 데이터는 오리진의 권한·입장 검사를 유지해요. [WAF 요청 제한](https://developers.cloudflare.com/waf/rate-limiting-rules/)

## 코드

- [입장 대기와 멱등성](../../backend/src/main/java/kr/it/reserve/reservation/admission)
- [원자적 대기 처리](../../backend/src/main/resources/redis/reservation-admission.lua)
- [필수 테이블](../../backend/src/main/resources/db/manual/reservation-admission.sql)

운영 설정·DDL·marker를 준비하는 것과 실제 운영 적용은 별도로 승인해요. Redis 장애 때 입장 대기를 해제하거나 MySQL 정원 검사를 생략하지 않아요.
