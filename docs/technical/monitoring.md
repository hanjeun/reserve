# 모니터링

로그와 서버 지표를 Loki 하나로 모으고, Grafana 대시보드와 알림으로 이상 상태를 잡아요.

## 구성

| 도구 | 역할 | 접근 |
|---|---|---|
| **Grafana** | 대시보드 · 알림 | [grafana.reserve.it.kr](https://grafana.reserve.it.kr) |
| **Loki** | 로그 · 지표 저장 | 내부 (포트 3100) |
| **Promtail** | 기존 파일 → Loki 전송 (지원 종료, Alloy 전환 필요) | 내부 |
| **Logback** | Spring Boot 로그 파일 (30일 rotation) | `/var/log/reserve/` |
| **collect-metrics.sh** | 호스트·컨테이너 지표 수집 (cron 1분) | `/var/log/metrics/` |
| **Sentry** | 런타임 에러 트래킹 | [sentry.io](https://sentry.io) |
| **UptimeRobot** | 업타임 모니터링 | [uptimerobot.com](https://uptimerobot.com) |
| **SonarCloud** | 정적 분석 (Automatic Analysis) | [sonarcloud.io](https://sonarcloud.io/projects) |

```
Spring Boot ─ Logback ─→ /var/log/reserve/app.log ─┐
cron ─ collect-metrics.sh ─→ /var/log/metrics/*.log ─┴─ Promtail ─→ Loki ─→ Grafana
nginx ─ privacy-safe Docker timing 로그 ─────────────┘
```

## 컨테이너

`docker-compose-monitoring.yml`이 `app-network`에 붙어요. nginx는 `grafana:3000`, Promtail은 `loki:3100`으로 접근하고, Grafana·Loki는 호스트 포트를 publish하지 않아요.

```bash
docker compose -f ~/docker-compose-monitoring.yml up -d
docker ps | grep -E "loki|promtail|grafana"
```

| 볼륨 | 용도 |
|---|---|
| `grafana-data` | 대시보드·알림 규칙 |
| `loki-data` | 로그 |
| `promtail-positions` | 파일별 읽은 위치 |

`promtail-config.yml`은 서버의 `~/promtail-config.yml`이 마운트돼요. 레포에서 고친 뒤 서버로 복사하고 재시작해요.

앱은 `app.log`, 백업은 `backup.log`를 서로 다른 job과 UTC 파서로 읽어요. 기존 positions 볼륨을 보존해요. 과거 로그를 다시 넣으려고 positions를 초기화하거나 백업을 강제 실행하지 않아요.

[Promtail은 2026년 3월 2일 지원이 종료됐어요](https://grafana.com/docs/loki/latest/send-data/promtail/). 아래 설정은 기존 2.9.0 수집 공백에 대한 작은 후속이고, 지원되는 Alloy로의 전환·메모리 예산·positions 이관은 별도 검증 대상이에요. 이 설정만으로 유지보수 문제가 해결되지는 않아요.

```bash
scp promtail-config.yml ubuntu@<서버>:~/
docker restart promtail
```

```bash
grep 'job_name' ~/promtail-config.yml
docker exec promtail ls /var/log/metrics
```

## Promtail 타임스탬프

`promtail-config.yml`의 `pipeline_stages`가 로그 줄 안의 시각을 타임스탬프로 쓰고 `level` 라벨을 붙여요.

```yaml
    pipeline_stages:
      - regex:
          expression: '^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) +(?P<level>[A-Z]+)'
      - labels:
          level:
      - timestamp:
          source: ts
          format: '2006-01-02 15:04:05'
          location: UTC
```

- `location: UTC`: 앱 컨테이너가 UTC로 돌아요
- `level` 라벨: 대시보드가 이 라벨로 걸러요
- logback 패턴을 바꾸면 이 정규식도 같이 바꿔요

## 과거 로그

Loki는 스트림의 가장 최근 엔트리에서 약 1시간 밖의 타임스탬프를 받지 않아요. 과거 로그는 서버에서 직접 봐요.

```bash
zgrep 'ERROR' /var/log/reserve/app.2026-07-29.0.log.gz
zgrep -c 'Email send failed' /var/log/reserve/app.*.log.gz
```

## 지표 수집 (collect-metrics.sh)

`scripts/collect-metrics.sh`가 원본이고, 서버 `~/collect-metrics.sh`로 배포해요. cron이 1분마다 `vmstat`·`free`·`df`·`docker stats` 값을 logfmt로 남겨요.

- CPU는 `cpu_user_pct`(us), `cpu_system_pct`(sy), `cpu_exec_pct`(us+sy), `cpu_iowait_pct`(wa), `cpu_steal_pct`(st)를 내요. `cpu_pct`(100-idle)는 호환용이에요
- 새 CPU 지표를 쓰는 대시보드는 새 collector를 서버에 설치한 뒤 import해요

### 설치

```bash
scp scripts/collect-metrics.sh ubuntu@<서버>:~/
ssh ubuntu@<서버>
sudo mkdir -p /var/log/metrics && sudo chown ubuntu:ubuntu /var/log/metrics
chmod +x ~/collect-metrics.sh
~/collect-metrics.sh && cat /var/log/metrics/metrics-$(date +%F).log   # 손으로 한 번
crontab -l 2>/dev/null | grep -q collect-metrics || \
  (crontab -l 2>/dev/null; echo "* * * * * /home/ubuntu/collect-metrics.sh") | crontab -
```

마지막 줄은 여러 번 실행해도 중복 등록되지 않아요.

### 출력 형식

지표 하나당 한 줄, `metric=<이름> value=<숫자>` 형식이에요.

```
kind=host metric=mem_available_mb value=617
kind=container name=green metric=mem_mb value=600.6
```

파일명이 날짜별로 바뀌므로 쿼리는 `by (...)`로 묶어요.

```logql
avg_over_time({job="metrics"} | logfmt | kind=`host` | metric=`mem_used_pct` | unwrap value [5m]) by (metric)
avg_over_time({job="metrics"} | logfmt | kind=`container` | metric=`mem_mb`  | unwrap value [5m]) by (name)
```

## 대시보드

`grafana/dashboards/*.json`을 Grafana → Dashboards → New → **Import** → 파일 업로드 → **하단 Loki 데이터소스 선택** → Import 순서로 올려요. 같은 uid가 있으면 **Import (Overwrite)**를 눌러요.

| 파일 | 제목 | 구성 |
|---|---|---|
| `reserve-logs.json` | RESERVE 로그 | 이상 징후 → 서비스 활동 → *추세* → *예약·결제 흐름* → *인증·보안* → *스케줄러* → *오류 분석* → *로그 상세* |
| `reserve-hardware.json` | RESERVE 서버 자원 | 현재 상태 → *메모리 추세* → *CPU·부하·디스크 추세* → *컨테이너 상세* |

- *기울임* 구역은 접혀 있고, 펼쳤을 때만 쿼리를 실행해요
- 기본 동시 쿼리 예산은 로그 10개 이하(annotation 포함), 서버 자원 6개 이하예요
- stat 카드는 instant 쿼리 하나만 쓰고 미니 그래프를 넣지 않아요
- 로그 건수는 `or vector(0)`으로 0건을 표시하고, 하드웨어 값은 최근 5분 표본이 없으면 `수집 없음`으로 보여요
- 두 대시보드 모두 `Starting ReserveApplication` 로그를 `배포 시점` annotation으로 표시해요
- 상태색은 ERROR·스왑·메일 실패처럼 비정상 값에만 쓰고, 활동량에는 색을 입히지 않아요. 컨테이너 색은 이름에 고정돼요

아래 검사는 CI의 `build-frontend`에서도 실행돼요.

```bash
node scripts/validate-grafana-dashboards.mjs
```

## 알림 규칙

UptimeRobot은 서비스 다운을, 아래 규칙은 다운은 아니지만 이상한 상태를 알려요.

아래 쿼리는 설계/런북 예시이고, 설치·평가·실수신 증거를 대신하지 않아요. 2026년 9월 30일 운영 경로는 기존 Resend SMTP를 사용하는 지정된 이메일이에요. TestAlert와 실제 Firing은 별도로 확인해요. SMTP와 앱 메일은 같은 Resend 장애에 영향을 받으므로 독립 수신 채널은 아직 별도 후속이에요. 이메일·비밀번호·토큰은 공개 문서에 넣지 않아요.

각 규칙은 Query A (Loki, **Instant**) → Expression B (Reduce, Last) → Expression C (Threshold) 구조예요. `Configure no data and error handling`에서 **No data를 `Alerting`**으로 둬요.

**1. 메일 발송 실패** — ABOVE 0 / 10분 주기 / pending 0m

```logql
sum(count_over_time({job="reserve"} |~ `email failed|Email send failed|Mail send failed` [1h]))
```

**2. ERROR 급증** — ABOVE 5 / 5분 주기 / pending 10m

```logql
sum(count_over_time({job="reserve", level="ERROR"} [10m]))
```

**3. 로그인 실패 급증** — ABOVE 30 / 5분 주기 / pending 10m

```logql
sum(count_over_time({job="reserve"} |= `Login failed` [10m]))
```

**4. 지표 수집 중단** — BELOW 1 / 10분 주기

```logql
sum(count_over_time({job="metrics"} [10m]))
```

**5. 미결 환불** — ABOVE 0 / 1시간 주기. 대응은 `docs/technical/payments.md`의 "미결 환불이 생겼을 때"

```logql
sum(count_over_time({job="reserve"} |= `Refund stuck unresolved` [1h]))
```

**6. 결제 운영 큐 미결** — ABOVE 0 / 15분 주기 / pending 0m. 대응은 `docs/technical/payments.md`의 "결제 대사 큐와 웹훅 inbox"

```logql
sum(count_over_time({job="reserve"} |= `Payment operations queue requires attention` [20m]))
```

**7. 백업 미실행** — BELOW 1 / 1시간 주기. 다음 정상 정기 실행의 원본 로그·파일/gzip와 새 `job="backup"` Loki 이벤트가 일치한 뒤 평가창·No data를 검증하고 켜요. 강제 백업이나 positions 초기화로 검증하지 않아요

```logql
sum(count_over_time({job="backup"} |= `[backup]` |= `=== backup done` [26h])) or vector(0)
```

**8. OAuth 탈퇴 연동 해제 미결** — ABOVE 0 / 15분 주기 / pending 0m. 대상은 `oauth_unlink_task`의 status·provider·member_id·last_error_type으로 봐요

```logql
sum(count_over_time({job="reserve"} |= `OAuth unlink queue requires attention` [20m]))
```

**9. S3 삭제 outbox 실패** — ABOVE 0 / 1시간 주기. 런북은 `docs/technical/data-lifecycle.md`의 "S3 파일 삭제 outbox"

```logql
sum(count_over_time({job="reserve"} |= `Queued file deletion failed` [70m]))
```

### 메일 발송 실패 감지 구조

| 겹 | 위치 | 역할 |
|---|---|---|
| ① | `EmailService`의 catch 절에 포함된 `MailException` | 실패를 도메인 로그로 남겨요 |
| ② | `AsyncConfig`의 `AsyncUncaughtExceptionHandler` | ①을 빠져나가는 것까지 잡아요 |
| ③ | 알림 규칙 1 "메일 발송 실패" | 그 로그를 사람에게 알려요 |

### 로그인 유지(refresh) 거절 사유 관측 쿼리 (알림 아님)

```logql
sum by (reason) (count_over_time({job="reserve"} |= `Refresh rejected` | regexp `reason=(?P<reason>[A-Z_]+)` [24h]))
```

| reason | 뜻 |
|---|---|
| `MISSING_COOKIE` | refresh 쿠키가 없음 |
| `EXPIRED_JWT` / `EXPIRED_SESSION` | 14일 동안 쓰지 않아 만료 |
| `UNKNOWN_TOKEN` | DB에 없는 토큰 |
| `AUTH_VERSION_CHANGED` | 비밀번호 변경·재설정 전 토큰 |
| `REUSED_TOKEN` (WARN) | 유예(60초)가 지난 직전 토큰 |
| `INVALID_JWT` / `NOT_REFRESH_TOKEN` (WARN) | 서명 불일치·용도 위반 |

- 성공은 `Refresh rotated`, 동시 요청 유예는 `Refresh reused within grace`로 남아요. 로그에는 memberId와 사유만 있어요
- 거절은 정상 수명 주기에서도 나므로 알림으로 만들지 않아요

### CSP Report-Only 관측 쿼리 (알림 아님)

```logql
{job="reserve"} |= `CSP violation observed`
```

- `CspReportController`는 `directive`와 `blockedScheme`만 남겨요
- `RESERVE 로그` 대시보드의 접힌 **인증 · 보안 → 관리자 · 보안 이벤트** 패널에도 같은 추세가 있어요
- 관측 절차와 강제 전환 기준은 [배포 운영](deployments.md)의 "4-1. CSP 위반 관측"을 따라요

### 문구 의존성

알림과 관측 쿼리는 아래 로그 문구를 문자열로 매칭해요. 로그 문구를 바꾸면 쿼리도 같이 바꿔요.

| 알림 | 기준 문구 | 문구가 있는 곳 |
|---|---|---|
| 로그인 실패 급증 | `Login failed` | `AuthApiController` |
| 메일 발송 실패 | `email failed`, `Email send failed`, `Mail send failed` 중 하나 | `EmailService`, 비동기 발송 서비스 |
| 미결 환불 | `Refund stuck unresolved` | `RefundReconciliationScheduler` |
| 결제 운영 큐 미결 | `Payment operations queue requires attention` | `PaymentOperationsMonitorScheduler` |
| OAuth 연동 해제 미결 | `OAuth unlink queue requires attention` | `OAuthUnlinkOperationsMonitorScheduler` |
| refresh 거절 사유 관측 | `Refresh rejected: reason=` | `TokenService` |
| CSP Report-Only 관측 | `CSP violation observed` | `CspReportController` |

기준 문구 뒤에는 개인정보가 아닌 진단값만 붙여요.

## Logback

`backend/src/main/resources/logback-spring.xml`

- 운영: `/var/log/reserve/app.log`, 30일 rotation
- 로컬: 콘솔만
- 패턴: `%d{yyyy-MM-dd HH:mm:ss} %-5level [%thread] %logger{36} - %msg%n`

컨테이너가 non-root(`appuser`)로 돌아서 디렉토리 소유권이 필요해요.

```bash
sudo mkdir -p /var/log/reserve && sudo chown -R 1000:1000 /var/log/reserve
```

### 로그 개인정보 경계

- 콘솔·파일·Loki 로그에는 직접 식별 가능한 개인정보와 비밀정보를 남기지 않아요
- 추적에는 `memberId`·도메인 엔티티 ID·상태 enum·`errorType`을 써요
- `PiiLogBoundaryTest`가 `log.*` 호출의 위험 인자와 원문 예외 메시지를 막아요
- 관리자 행위는 일반 로그가 아닌 `audit_log`에 남아요

## nginx 로그 수집

`nginx/default.conf`의 `reserve_timing`은 IP·동적 ID·쿼리·쿠키·토큰·본문 없이 route 종류와 지연만 기록해요. 현재 Docker json-file을 그대로 읽으므로 nginx는 재시작하지 않아요.

- `docker-compose-observability.yml`을 기존 monitoring compose에 더해 nginx 컨테이너의 **검증된 로그 디렉터리 하나만** read-only 마운트해요. Docker socket이나 전체 containers 경로는 마운트하지 않아요.
- Docker 시각을 보존하고 stdout의 완전한 allowlist 스키마만 전송해요. stderr·다른 형식·추가 식별 필드·1시간보다 오래된 nginx 항목은 버려요. 기존 app/backup positions는 그대로예요.
- nginx 컨테이너가 나중에 재생성되면 LogPath도 달라지므로 새 경로를 다시 확인하고 Promtail 마운트만 갱신해요. 수집 부재는 지연/오류 0건이 아니에요.
- 기존 compose의 `~/promtail-config.yml`은 sudo 실행 시 `/root`로 풀릴 수 있어요. overlay는 현재 설치된 `/home/ubuntu/promtail-config.yml`을 명시적으로 read-only 마운트해요. 다른 서버에서는 실제 설치 경로를 먼저 확인해요.

기존 설정과 positions를 보존하고 새 config의 2.9.0 syntax·합성 파이프라인 검사를 통과한 뒤, 적용은 **Promtail만** 해요. Grafana·Loki·앱·DB는 재생성하지 않아요.

```bash
NGINX_LOG_PATH=$(sudo docker inspect --format '{{.LogPath}}' nginxserver)
NGINX_LOG_DIR=${NGINX_LOG_PATH%/*}
[[ "$NGINX_LOG_DIR" =~ ^/var/lib/docker/containers/[0-9a-f]{64}$ ]] || exit 1
sudo test -f "$NGINX_LOG_PATH" || exit 1
sudo env RESERVE_NGINX_LOG_DIR="$NGINX_LOG_DIR" docker compose \
  -f /home/ubuntu/docker-compose-monitoring.yml \
  -f /home/ubuntu/docker-compose-observability.yml \
  up -d --no-deps --force-recreate promtail
```

적용 뒤 새 원본 CPU 표본과 Loki `job="metrics"`, 새 nginx 요청과 `job="nginx"`의 시각·스키마를 대조해요. 이전 compose와 config로 Promtail만 복구할 수 있어야 해요. 호스트 CPU 표본 한 개로 장기 지연 원인을 단정하지 않아요.

## Sentry

| 이름 | 용도 |
|---|---|
| `SENTRY_DSN` | 백엔드 DSN (GitHub Secrets → docker-compose) |
| `VITE_SENTRY_DSN` | 프론트 DSN (GitHub Secrets → `.env.production`) |

## UptimeRobot

5분 간격으로 `https://reserve.it.kr`를 헬스체크하고, 다운 시 이메일로 알려요.

## SonarCloud

**Automatic Analysis**로 SonarCloud가 저장소를 직접 분석해요. 워크플로에 sonar 스텝과 `sonar-project.properties`가 없어서 CI와 독립적으로 돌아요.
