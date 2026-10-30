# 서비스 공통 입장권

서비스 공통 입장권은 접속자가 많을 때 핵심 작업을 시작할 수 있는 브라우저 수를 제한해요. 로그인·회원 권한·예약 자리·현장 웨이팅 순번과는 별개의 제한이에요. 기본값은 꺼짐이며, 입장권을 받은 뒤에도 기존 인증·소유자 확인·MySQL 예약 정원 검사는 그대로 적용돼요. 앱의 입장 관문이며 네트워크·정적 자원·DDoS를 막는 엣지 관문은 아니에요.

## 적용 모드

`reserve.service-admission.enabled`가 `false`이면 Redis 없이 통과해요. 기능을 켠 경우 Redis `control`의 모드가 적용돼요.

| 모드 | 입장권을 확인하는 요청 |
|---|---|
| OFF | 공통 입장권 제한을 적용하지 않음 |
| CORE | `POST /api/reservations`, `POST /api/stores`, `POST /api/waiting/stores/{숫자}/entries` |
| EMERGENCY | 아래 보존 경로를 제외한 API 요청 |

CORE가 켜진 동안 활성 입장권 정원이 차면 새 방문자는 자동으로 순서를 기다리고, 대기 저장 상한까지 차면 FULL을 반환해요. 대기 정원만으로 EMERGENCY로 바뀌지는 않아요. 운영자가 준비 도구에서 정한 OFF·CORE·EMERGENCY가 기본 모드이며, 자동 정책은 별도로 켠 경우 기본 CORE 위에서만 보호를 강화하거나 원래 CORE로 복귀해요. 수동 OFF와 수동 EMERGENCY는 자동 정책보다 우선해요. 거래·계정·결제의 보존 경로는 유지돼요.

`/api/v1/` 요청은 같은 `/api/` 경로로 정규화해요. 비상 모드에서도 다음 요청은 공통 입장권 때문에 막지 않아요. 각 요청의 기존 인증·인가·업무 제한은 별도로 유지돼요.

- `/api/` 밖의 경로와 `OPTIONS`, 모든 `PATCH`·`DELETE` 요청
- `/api/service-admission`, `/api/auth`, `/api/email`, `/api/password-reset`, `/api/member`, `/api/payment`, `/api/admin`, `/api/oauth/events`, `/api/chat`, `/api/inquiries`, `/api/updates` 각각의 정확한 경로와 `/`로 이어지는 하위 경로
- 정확한 `/api/csp-reports` 경로
- `/api/reservations/` 하위 경로 중 정확한 `availability`·`calendar`와 `admission`으로 시작하는 경로를 제외한 요청
- `/api/waiting/` 하위 경로 중 정확한 `/api/waiting/stores`와 CORE의 신규 현장 웨이팅 등록 요청을 제외한 요청

새 예약·가게 등록·현장 웨이팅 진입을 제한하더라도 진행 중인 거래의 완료·취소·복구와 계정·결제 처리는 보존하는 정책이에요. EMERGENCY도 정적 페이지나 모든 통신을 차단하는 모드는 아니에요. 경로의 정본은 [ServiceAdmissionRoutes](../../backend/src/main/java/kr/it/reserve/global/admission/ServiceAdmissionRoutes.java)예요.

## 설정과 Redis 상태

| `reserve.service-admission` 설정 | 기본값과 허용 범위 |
|---|---|
| enabled | `false` |
| capacity | 20, 1~10,000 |
| session-seconds | 900, 30~86,400초 |
| max-session-seconds | 7,200, session-seconds 이상~604,800초 |
| heartbeat-timeout-seconds | 90, 30~300초 |
| max-waiting | 1,000, 1~100,000 |
| epoch | 활성화할 때 필요한 16~64자 영문·숫자·하이픈 세대 값 |

인증된 전용 Redis와 환경별 namespace를 사용해요. local은 `reserve:local:service-admission:{entry}:`, production은 `reserve:prod:service-admission:{entry}:`를 사용해요. 키는 `control` 해시, `waiting`·`active`·`heartbeats` 정렬 집합, `born` 해시, `sequence` 문자열이에요. `control`에는 `marker`와 `mode`가 필요해요.

marker는 `v1|epoch|capacity|sessionSeconds|maxSessionSeconds|heartbeatTimeoutSeconds|maxWaiting`의 UTF-8 SHA-256이에요. 모드는 marker에 포함하지 않아 OFF·CORE·EMERGENCY 전환 때 기존 입장권을 보존해요. 정원·유효 시간·세대가 달라지면 marker도 달라져요. marker 누락·불일치·잘못된 모드·Redis 장애를 OFF로 해석하거나 자동 초기화하지 않아요.

라우팅 모드 조회는 최대 1초 동안만 캐시해요. 캐시 만료 후 Redis 조회가 실패하면 지난 OFF 값을 사용하지 않고, 보존 경로 외 API는 503으로 닫혀요. 보호 API의 입장권 확인과 join·status·cancel은 매번 최신 control을 확인해요. CORE에서 다른 페이지를 계속 이용할 수 있다는 정책도 상태 조회가 정상이라는 전제가 있어요.

## 단일 인스턴스의 초기 예산

기본 활성 입장권 20개와 대기 1,000개는 512MiB heap을 쓰는 초기 단일 JVM을 위한 보수적인 시작값이에요. 입장권은 방문자 수를 제한하며 실행 중인 요청·DB 연결·예약 자리를 뜻하지 않아요. 현재 Hikari pool 기본 상한은 JVM당 10개이고 Tomcat worker 기본 상한은 200개예요. 입장한 브라우저도 여러 요청을 만들 수 있으므로 입장권 20개가 pool 20개나 검증된 RPS를 의미하지 않아요.

대기자 1,000명이 안내 간격을 모두 지킬 때 순번 구간별 상태 조회는 `10/4 + 90/10 + 900/20 = 56.5회/초`예요. 이 값은 정규 폴링만의 계산이며 신규 입장·재시도·보호 API·버스트를 포함하지 않아요. 실제 처리량이나 SLO를 증명하는 부하 결과가 아니에요. 정원과 유효 시간을 바꾸면 marker도 바뀌므로 기존 control을 덮어쓰거나 자동 reset하지 않아요.

두 Redis Compose는 `maxmemory 64mb`와 `noeviction`을 마지막 실행 인자로 강제하고, 컨테이너 메모리와 swap 포함 상한은 각각 128MiB로 맞춰요. 나머지 64MiB는 프로세스·할당·클라이언트 버퍼 등 Redis maxmemory 밖의 사용량을 위한 여유예요. 실제 RSS나 persistence 동작의 최대치를 보장하는 값은 아니에요. Redis 예산은 공통 입장권뿐 아니라 같은 Redis의 공유 제한·중계·인기 예약 상태도 함께 사용해요. 상한 도달 시 입장 상태를 축출하지 않고 쓰기를 거절하므로, 입장 장애를 자동 통과로 바꾸지 않아요. 호스트 포트 비공개·필수 비공개 설정 마운트·인증·환경별 namespace를 유지해요.

Blue/Green이 겹치면 JVM heap 상한만 `512 + 512 = 1,024MiB`이며 Redis 컨테이너 상한까지 더한 값은 1,152MiB예요. 여기에 JVM native 메모리·MySQL·관측·nginx·OS가 더 필요해요. 이 합계는 호스트 전체 메모리 예산이 아니며, 새 앱을 기동하기 전에 실제 가용 메모리와 기존 앱의 전체 RSS를 확인해야 해요. JVM·MySQL의 전역 설정은 이 입장권 예산으로 자동 조정하지 않아요.

Redis 프로세스 설치·인증 연결·메모리 정책을 확인하는 것과 신규 앱의 공통 입장 기능을 적용하는 것은 별개예요. 공통 gate는 앱의 명시적 활성화, 동일 설정의 control marker 초기화, 앱 경로 검증까지 필요해요. Redis가 실행 중이라는 사실만으로 공통 gate가 적용됐다고 판단하지 않아요.

## 선택적 자동 보호

`reserve.service-admission.automatic.enabled`와 환경변수 `RESERVE_SERVICE_ADMISSION_AUTOMATIC_ENABLED`의 기본값은 `false`예요. 공통 입장 기능이나 자동 정책이 꺼져 있으면 부하 샘플과 자동 정책용 Redis 호출을 하지 않아요. 자동 정책을 켜도 서버 프로세스·JVM·MySQL·Redis 설정이나 입장 정원을 바꾸지 않아요.

기존 스케줄러가 5초 간격으로 로컬 지표를 읽어요. 호스트 메모리는 `/proc/meminfo`를 최대 8 KiB로 읽어 MemAvailable만 사용하고 swap을 더하지 않아요. CPU는 JDK가 제공하는 운영체제 CPU 사용률, heap은 현재 JVM의 사용량/최대 heap 비율이에요. 외부 지표 API나 DB 조회는 사용하지 않아요. CPU 측정값이 아직 없거나 호스트 메모리를 읽을 수 없으면 해당 지표는 미확인으로 취급해요.

| 지표 | 위험 관측 | 회복 관측 |
|---|---|---|
| MemAvailable | 128 MiB 미만 | 256 MiB 초과 |
| CPU 사용률 | 90% 이상 | 65% 이하 |
| JVM heap 비율 | 90% 이상 | 75% 이하 |

확인된 지표 하나라도 위험하면 위험 관측이에요. 회복에는 세 지표가 모두 확인되고 회복 기준을 충족해야 해요. 중간 구간이나 미확인 값은 회복 관측이 아니에요. 기본값은 위험 30초 지속 후 EMERGENCY, 회복 120초 지속과 EMERGENCY 최소 유지 120초를 모두 충족한 뒤 CORE 복귀예요. 이 수치는 현재 서버를 위한 초기 방어 정책이며 처리량·응답 시간·사용자 수를 보장하는 실측 결과가 아니에요.

EMERGENCY의 실제 요청 제한도 회복 판단에 반영해요. IP·전체 요청 한도나 동시 처리 8개 제한으로 `SERVICE_ADMISSION_THROTTLED`를 반환하면 로컬 monotonic 시각 하나만 기록하고 Redis를 추가 호출하지 않아요. 최근 15초 안에 이런 제한이 있으면 건강한 지표도 CLEAR 대신 HOLD로 보내 회복 누적을 끊어요. 제한이 멎은 뒤 15초의 조용한 구간을 확인한 다음 회복 120초를 처음부터 누적해요. 메모리·CPU·heap의 위험 판정은 그대로이며 요청 제한만으로 CORE에서 HIGH를 만들지 않아요. 이 신호는 현재 단일 활성 앱의 로컬 신호이고, 짧은 Blue/Green 중첩에서는 Redis 관측 소유 프로세스가 받은 제한 신호만 회복에 반영돼요.

Redis control의 `autoState`, `autoOwner`, `autoLeaseUntil`, `autoObservedAt`, `autoHighMs`, `autoClearMs`, `autoEmergencyMs`, `autoSignal`에 작은 판단 상태를 보존해요. 20초 관측 소유권으로 Blue/Green 중첩 중에도 한 프로세스만 판단을 갱신해요. 관측 소유권을 넘겨받거나 관측 공백이 15초를 넘거나 Redis 시각이 역행하면 연속 판단 시간을 다시 세고 EMERGENCY는 유지해요. 한 샘플 사이의 시간은 최대 5초까지만 누적하므로 큰 시각 변화가 회복 근거를 채우지 못해요. heap 지표는 이 관측 소유 프로세스의 값이며 여러 JVM을 합산한 값이 아니에요.

자동 EMERGENCY는 앱 재시작 후에도 보존해요. 자동 flag를 끄면 새 관측과 자동 변경만 멈추고 저장된 강화 상태는 계속 적용해요. 명시적으로 OFF를 적용하면 준비 도구가 위 8개 필드만 제거해요. 이후 CORE에서는 새 관측부터 판단하며 입장권·대기 순번·최초 절대 만료·marker는 유지돼요. 일부 필드만 있거나 형식이 깨진 자동 상태는 CORE로 조용히 복귀하지 않고 입장 상태 확인 실패가 돼요. 수동 모드와 자동 판단은 같은 원자적 Lua에서 유효 모드로 해석해요. DTO에는 기존 CORE·EMERGENCY만 사용하고 AUTO 모드를 추가하지 않아요.

## 기존 장애 완화의 범위

공통 입장 엔진은 Redis 연결 실패 뒤 monotonic 시각으로 5초 동안 추가 연결을 억제하고 즉시 확인 실패를 반환해요. 그 뒤 요청 하나만 복구를 확인하며 다른 요청은 기다리지 않고 거부해요. 연결에 성공하면 정상 확인을 재개해요. 실패를 정상 입장 응답으로 캐시하지 않고 권한이나 입장 검사를 우회하지 않아요. 경로 판별용 모드 캐시는 최대 1초이며 연결 실패 때 무효화해요.

공유 rate limit과 Redis 중계의 `RedisFailureBackoff`는 별도 장치예요. 공유 제한 실패 시 유지하는 로컬 Bucket4j 제한이나 중계의 조회·폴링 복구를 공통 입장 실패 시 자동 통과로 사용하지 않아요. 공통 입장권과 인기 예약 입장권은 Redis 확인 실패 시 닫히는 별도 관문이에요.

## 운영 준비 도구

[PrepareServiceAdmission](../../scripts/java/kr/it/reserve/tools/PrepareServiceAdmission.java)은 해당 릴리스 클래스패스에서 독립 실행하는 도구예요. Spring 앱이나 worker를 시작하지 않아요. `--config` JSON에는 `epoch`와 선택적인 `capacity`, `sessionSeconds`, `maxSessionSeconds`, `heartbeatTimeoutSeconds`, `maxWaiting`만 허용해요. 생략한 수치는 위 기본값을 사용하며, 앱에 적용할 값과 정확히 일치해야 해요. 알 수 없는 필드·중복 필드·문자열 수치·소수 수치는 거부해요. `enabled`와 Redis 비밀 값은 이 파일에 넣지 않아요.

기본 동작은 설정 검증과 marker·요청 모드·namespace 요약이에요. Redis에 연결하지 않고 앱의 기본 활성화 설정도 바꾸지 않아요. `--mode`는 OFF·CORE·EMERGENCY 중 하나이며 생략한 preview 모드는 OFF예요. 변경에는 `--apply`와 명시적인 `--mode`가 모두 필요해요. production namespace는 별도의 `--production` 선택이 필요해요.

실제 변경에만 전용 `RESERVE_REDIS_HOST`, `RESERVE_REDIS_PORT`, `RESERVE_REDIS_PASSWORD`, 선택적인 `RESERVE_REDIS_USERNAME`을 읽어요. local 연결은 loopback IP만, production 연결은 고정 Docker 호스트명 `redis` 또는 RFC1918 IPv4만 허용해요. 공개 호스트·다른 DNS 이름은 거부해요. 비밀 값은 32~256자 출력 가능한 ASCII, 충분한 문자 다양성, 반복 패턴·예제 비밀 부재를 확인하며 무작위로 생성한 전용 값을 사용해야 해요. 이 형식 검사는 실제 비밀의 무작위성을 증명하지 않아요. 출력에는 Redis 주소·계정·비밀·설정 파일 경로를 넣지 않아요.

연결 뒤 `CONFIG GET maxmemory-policy`로 `noeviction`을 확인해야 변경할 수 있어요. 운영자용 Redis 권한은 대상 namespace의 고정 키와 설정 조회·원자적 준비에 필요한 명령 범위로 제한해요. 도구는 Redis 설정·ACL·앱 환경을 변경하지 않아요.

초기화와 모드 변경은 한 Lua에서 처리해요. control과 나머지 상태 키가 모두 없을 때만 marker·mode를 함께 만들어요. 기존 control의 marker가 정확히 일치하고 모드·키 타입·control의 영구 보관이 유효할 때만 모드를 바꿔요. 명시적인 OFF만 고정된 8개 자동 정책 필드를 제거하며 결과는 `AUTOMATIC_STATE_CLEARED`로 구분해요. 이미 OFF여도 잔여 자동 필드는 제거하고, 같은 입력으로 다시 적용하면 `ALREADY_PREPARED`가 돼요. 그 외 같은 모드는 상태를 쓰지 않아요. control 없이 다른 상태가 남거나 marker·타입이 맞지 않으면 거부해요. 입장권·대기 키 삭제·marker 교체·유효기간 변경·강제 reset 기능은 제공하지 않아요. 응답이 유실되면 결과를 UNKNOWN으로 남겨 재확인이 필요해요.

도구 준비·Redis 상태 변경·앱 활성화·운영 연결 검증은 서로 다른 단계예요. 운영 적용과 복구 판단은 대상·상태 보존 범위를 확인해 별도로 승인해요. 공통 입장권은 인기 예약 행사의 marker와 MySQL 정원 검사를 대신하지 않아요.

## 입장권과 상태 확인

고정 `/api/service-admission` 경로의 POST는 입장 요청, GET은 현재 상태 확인, DELETE는 명시적 반환이에요. 입장권은 서버가 발급하고 HttpOnly 쿠키로 전달해요. 응답의 `continuityId`는 탭 간 상태 일치 확인용 해시이며 입장권이나 인증 수단이 아니에요. local 쿠키는 `reserve_entry`, production 쿠키는 `__Host-reserve-entry`예요.

새 예약은 공통 입장권을 확인한 뒤 특정 인기 예약의 입장 대기를 시작해요. 거절된 예약·신청 요청은 입장 후 자동 재전송하지 않아요. 입력 화면을 유지하고 사용자가 다시 신청해야 하며, 그때 서버의 입장권·회원 권한·정원을 다시 확인해요.

응답 유실로 이전 요청 번호가 남아 있으면 `POST /api/reservations/requests/result`로 결과부터 확인해요. 이 경로는 기존 인증과 회원별 조회 제한을 거치며, 같은 회원·요청 번호·예약 내용을 대조해요. `outcome`은 커밋된 신청이 없는 `NOT_SUBMITTED`, 기존 예약을 `reservation`에 담은 `RESERVED`, 취소·거절 또는 삭제된 종료 예약의 `CLOSED`로 구분해요. `CLOSED`는 예약 원문을 반환하지 않아요. 같은 번호에 다른 내용이거나 결과 기록의 예약을 확인할 수 없으면 409예요.

`NOT_SUBMITTED`는 기존 요청 번호로 생성 관문을 다시 거치고, `CLOSED`만 새 요청 번호로 시작해요. 이전 예약·결제 원장과 요청 번호의 연결은 바꾸지 않아요. 기한이 지났더라도 아직 취소되지 않은 예약이나 일반 404·통신 실패를 새 신청의 근거로 사용하지 않아요. 복구 조회 자체는 신규 예약·입장권 소비·결제·데이터 쓰기를 하지 않으며, 새 예약은 공통 입장·인기 예약 입장·정원·중복 검사를 다시 통과해야 해요. 신규 요청 번호에는 복구 조회를 추가하지 않아요.

대기자는 CORE에서 순번 1~10이면 4초, 11~100이면 10초, 그 뒤면 20초 간격을 안내해요. EMERGENCY에서는 같은 순번 구간에 8초·20초·30초로 안내를 늘려요. 안내 간격은 대기 heartbeat 유예의 1/3을 넘지 않아요. 입장 후 안내 간격은 세션 유예의 1/3과 60초 중 짧은 값이에요. CORE에서 입장한 브라우저는 일반 탐색 중에는 주기적 keepalive 조회를 멈추고 핵심 API 활동이 있을 때 기본 15분의 세션 유예를 연장해요. 다만 `/store/{숫자}`, `/store/register`, `/waiting` 작성 화면이 보이는 동안에는 서버가 안내하는 최대 60초 기준 간격의 조회로 활동을 유지하고, 작성 화면을 벗어나거나 화면이 숨겨지면 그 조회를 멈춰요. EMERGENCY에서 입장한 브라우저도 화면이 보일 때 안내 간격에 따라 활동을 유지해요. 간격은 모드·순번·유효 시간에 따른 정책이에요. 브라우저는 서버 시각과 안내 간격을 사용하고, 같은 브라우저의 여러 탭은 상태 조회를 조정해요.

활성화된 입장 API의 신규 요청은 IP별 분당 120회, 모든 상태 조회·취소는 Redis 처리 전에 IP별 분당 600회로 제한해요. 서버가 확인한 유효 입장권의 GET 응답에는 입장권 해시별 분당 60회 제한도 적용해요. 임의의 쿠키 값을 바꿔 IP 제한을 피하거나 검증되지 않은 입장권별 메모리 버킷을 만들 수 없어요. 취소는 IP 제한만 적용하므로 입장권별 조회 한도가 소진돼도 공통 IP 한도가 남아 있으면 입장권을 반환할 수 있어요. 이 제한은 현재 단일 애플리케이션의 메모리 버킷을 사용해요. 수치는 초기 방어 설정이며, 공유 IP 환경과 운영 처리량을 측정해 검토해야 해요. 비활성화된 기능은 Redis와 이 제한기를 호출하지 않아요.

수동·자동 EMERGENCY 모두 보존 경로 밖의 보호 요청에 IP별 분당 120회와 앱 전체 초당 30회 제한을 추가해요. 유효 입장권을 확인한 뒤 동시에 처리하는 요청은 8개로 제한하며 대기열은 만들지 않아요. 한도를 넘으면 `SERVICE_ADMISSION_THROTTLED` 코드와 `Retry-After: 10`을 반환해요. 계정·결제·진행 중 예약 등 보존 경로는 이 추가 제한을 적용하지 않아요. 이 수도 초기 방어 값이며 인증·예약 정원·실제 서버 처리량을 대신하지 않아요.

입장 후 활동은 세션 유효 시간을 연장하지만 최초 입장의 최대 유효 시간인 기본 2시간을 넘지 않아요. 보호 API의 빠른 확인은 이미 입장한 방문자의 활동만 갱신하며 신규 입장·대기 순번 승격·대기 heartbeat 갱신을 하지 않아요. 대기 확인이 끊기거나 최대 유효 시간이 지나면 만료돼요. OFF로 전환해도 상태를 지우거나 원래 기한을 늘리지 않아요.

입장 화면은 기존 모달·숫자 전환 컴포넌트를 재사용해요.

## 코드

- [설정·서비스·경로](../../backend/src/main/java/kr/it/reserve/global/admission)
- [HTTP 관문](../../backend/src/main/java/kr/it/reserve/config/ServiceAdmissionHttpFilter.java)
- [원자적 입장 처리](../../backend/src/main/resources/redis/service-admission.lua)
- [브라우저 폴링 조정](../../frontend/src/utils/admissionPollingCoordinator.js)
