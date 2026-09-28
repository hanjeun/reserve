# 모니터링

로그와 서버 지표를 Loki 하나로 모으고, Grafana 대시보드와 알림으로 "죽지는 않았지만 이상한" 상태를 잡아요.

## 구성 요약

| 도구 | 역할 | 접근 |
|---|---|---|
| **Grafana** | 대시보드 · 알림 | [grafana.reserve.it.kr](https://grafana.reserve.it.kr) |
| **Loki** | 로그 · 지표 저장 | 내부 (포트 3100) |
| **Promtail** | 파일 → Loki 전송 | 내부 |
| **Logback** | Spring Boot 로그 파일 (30일 rotation) | `/var/log/reserve/` |
| **collect-metrics.sh** | 호스트·컨테이너 지표 수집 (cron 1분) | `/var/log/metrics/` |
| **Sentry** | 런타임 에러 트래킹 | [sentry.io](https://sentry.io) |
| **UptimeRobot** | 업타임 모니터링 | [uptimerobot.com](https://uptimerobot.com) |
| **SonarCloud** | 정적 분석 (Automatic Analysis) | [sonarcloud.io](https://sonarcloud.io/projects) |

```
Spring Boot ─ Logback ─→ /var/log/reserve/app.log ─┐
cron ─ collect-metrics.sh ─→ /var/log/metrics/*.log ─┴─ Promtail ─→ Loki ─→ Grafana
```

## 이 스택이 존재하는 이유 — 메일 3주 무단 중단

> 주의: `EmailService`의 catch 절에서 `MailException`을 지우면 이 사고가 그대로 재현돼요. 코드의 `EmailService` 클래스 주석과 `AsyncConfig`가 이 절을 가리켜요.

폐기된 Resend 키가 서버에 남아 SMTP가 `535 Authentication credentials invalid`를 돌려주는데도, 화면에는 "발송되었습니다"가 떴어요. 3주 동안 회원가입 인증·비밀번호 재설정·예약 알림 메일이 전부 나가지 않았어요.

두 겹으로 숨었어요.

1. `mailSender.send()`는 `MessagingException`을 던지지 않아요. Spring이 `MailException`(`MailAuthenticationException` · `MailSendException`, `RuntimeException` 계열)으로 감싸서 당시의 `catch (MessagingException | UnsupportedEncodingException)`에 걸리지 않았어요.
2. 발송 메서드가 `@Async`라 예외가 호출자에게 전파되지 않았어요.

실패 로그는 첫날부터 쌓였지만 아무도 보지 않았어요. 사람이 로그 파일을 여는 절차는 반드시 실패하니, 기계가 깨워야 해요.

| 겹 | 위치 | 역할 |
|---|---|---|
| ① | `EmailService`의 catch 절에 포함된 `MailException` | 실패를 도메인 로그로 남겨요 |
| ② | `AsyncConfig`의 `AsyncUncaughtExceptionHandler` | ①을 빠져나가는 것까지 잡아요 |
| ③ | 아래 알림 규칙 1 "메일 발송 실패" | 그 로그를 사람에게 밀어줘요 |

③이 없으면 ①·②는 "잘 기록된 채로 아무도 모르는 장애"가 될 뿐이에요.

## 왜 Prometheus가 없는가

서버 메모리는 전체 약 1907MB, 여유 약 620MB이고 스왑을 이미 600MB 쓰고 있어요. Spring Boot 컨테이너 하나가 약 600MB인데 블루/그린 배포는 이걸 하나 더 띄워요. 여기에 Prometheus(170~300MB)를 얹으면 배포 도중 OOM으로 컨테이너가 죽을 수 있어요.

그래서 cron이 1분마다 `vmstat`·`free`·`df`·`docker stats`를 logfmt로 찍고, 이미 있는 Loki가 수집해요. 상주 메모리와 추가 컨테이너가 없고, `docker stats` 덕분에 cAdvisor 없이 컨테이너별 지표도 나와요.

- 대가: 해상도가 1분 고정이라 순간 스파이크는 못 잡아요. "배포 때 메모리가 어디까지 차는가", "스왑이 언제부터 늘었나"는 정확히 보여요.
- 서버를 키우면 그때 Prometheus로 바꿔요.

## Promtail 타임스탬프

Promtail은 기본적으로 로그 줄 안의 시각이 아니라 **자기가 읽은 순간**을 타임스탬프로 써요. promtail이 재시작해 파일을 처음부터 다시 읽으면 하루치 로그가 1초 안에 쌓이고, 대시보드는 멀쩡히 렌더되는데 숫자만 틀려요.

`promtail-config.yml`의 `pipeline_stages`가 이걸 막아요. 지우지 마세요.

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

- **`location: UTC`**: 앱 컨테이너가 UTC로 돌아요. KST로 적으면 전부 9시간 밀려요. 서버 `date`와 `tail -1 /var/log/reserve/app.log`의 시각이 같으면 UTC예요
- **`level` 라벨**: 대시보드가 이걸로 걸러요. 인덱스 라벨이라 라인 스캔보다 싸고, 본문에 "ERROR"가 들어간 줄로 오탐하지 않아요
- **logback 패턴을 바꾸면 이 정규식도 바꿔야 해요.** 안 그러면 아무것도 깨지지 않은 채 타임스탬프가 수집 시각으로 되돌아가요

배포·설정 변경 뒤 한 번 검증해요. Grafana 왼쪽 시각과 줄 안의 시각이 일치해야 하고, 전부 같은 값으로 뭉쳐 있으면 실패예요.

```
{job="reserve"}
```

## Loki는 과거 로그를 받지 않는다

각 스트림은 가장 최근 엔트리로부터 약 1시간 밖의 타임스탬프를 거부해요(`unordered_writes` 윈도우). 조용히 버려지고 promtail 로그에도 남지 않아서 백필이 불가능해요.

과거 로그는 Loki가 아니라 서버에서 직접 봐요.

```bash
zgrep 'ERROR' /var/log/reserve/app.2026-07-29.0.log.gz
zgrep -c 'Email send failed' /var/log/reserve/app.*.log.gz
```

## 컨테이너 구성

`docker-compose-monitoring.yml`이 `app-network`에 붙어 Spring Boot 컨테이너와 통신해요. nginx는 `grafana:3000`, Promtail은 `loki:3100`으로 같은 Docker 네트워크에서 접근하므로 Grafana·Loki는 호스트 포트를 publish하지 않아요. Lightsail 방화벽이 풀려도 직접 노출되지 않게 하는 2차 방어선이에요.

Compose 파일을 바꾸면 서버 파일 교체와 컨테이너 재생성 뒤에야 운영에 반영돼요.

```bash
docker compose -f ~/docker-compose-monitoring.yml up -d
docker ps | grep -E "loki|promtail|grafana"
```

### 볼륨 세 개

| 볼륨 | 없으면 |
|---|---|
| `grafana-data` | 대시보드·알림 규칙이 컨테이너와 함께 사라져요 |
| `loki-data` | 컨테이너 재생성 한 번에 로그 전체가 사라져요 |
| `promtail-positions` | 재시작마다 전체 파일을 재전송해요 (타임스탬프 함정과 겹치면 치명적) |

### 레포 ↔ 서버 드리프트

`promtail-config.yml`은 서버의 `~/promtail-config.yml`이 마운트돼요. 레포만 고치면 반영되지 않아요.

```bash
scp promtail-config.yml ubuntu@<서버>:~/
docker restart promtail
```

> 주의: 레포에만 있던 nginx job이 서버에 없어서 `{job="nginx"}` 조회가 처음부터 0건이었던 적이 있어요. 바꾼 뒤에는 서버에서 확인해요.

```bash
grep 'job_name' ~/promtail-config.yml
docker exec promtail ls /var/log/metrics
```

## 지표 수집 (collect-metrics.sh)

`scripts/collect-metrics.sh`가 원본이고, 서버 `~/collect-metrics.sh`로 배포해요.

- CPU는 `cpu_exec_pct`(us+sy), `cpu_iowait_pct`(wa), `cpu_steal_pct`(st)를 내요. 기존 `cpu_pct`(100-idle)는 호환용으로 유지해요
- 새 CPU 지표를 쓰는 대시보드는 새 collector를 서버에 설치하고 새 시계열을 확인한 **뒤에** import해요

### 설치 (새 서버 구축 시)

```bash
scp scripts/collect-metrics.sh ubuntu@<서버>:~/
ssh ubuntu@<서버>
sudo mkdir -p /var/log/metrics && sudo chown ubuntu:ubuntu /var/log/metrics
chmod +x ~/collect-metrics.sh
~/collect-metrics.sh && cat /var/log/metrics/metrics-$(date +%F).log   # 손으로 한 번
crontab -l 2>/dev/null | grep -q collect-metrics || \
  (crontab -l 2>/dev/null; echo "* * * * * /home/ubuntu/collect-metrics.sh") | crontab -
```

마지막 줄은 멱등해요. 여러 번 실행해도 중복 등록되지 않아요.

### 출력 형식 — 지표 하나당 한 줄

```
kind=host metric=mem_available_mb value=617
kind=container name=green metric=mem_mb value=600.6
```

Loki의 `unwrap`은 지정한 필드 외 나머지를 전부 라벨로 남겨요. 한 줄에 여러 지표를 담으면 매 샘플 바뀌는 값이 라벨이 돼서 샘플마다 새 시계열이 생기고, 그래프가 점으로만 찍혀요. `metric=<이름> value=<숫자>`로 쪼개면 안정적인 라벨만 남아요. 타임스탬프 필드를 넣지 않는 것도 같은 이유예요.

### 쿼리에 `by (...)`가 필요한 이유

파일명이 날짜별로 바뀌어 `filename` 라벨이 자정에 달라져요. 그대로 두면 자정마다 선이 끊겨요.

```logql
avg_over_time({job="metrics"} | logfmt | kind=`host` | metric=`mem_used_pct` | unwrap value [5m]) by (metric)
avg_over_time({job="metrics"} | logfmt | kind=`container` | metric=`mem_mb`  | unwrap value [5m]) by (name)
```

## 대시보드

`grafana/dashboards/*.json`을 Grafana → Dashboards → New → **Import** → 파일 업로드 → **하단 Loki 데이터소스 선택** → Import 순서로 올려요. 데이터소스 선택을 빠뜨리면 전 패널이 "Datasource not found"가 돼요. 같은 uid가 있으면 **Import (Overwrite)**를 누르면 되고, 삭제 후 재import할 필요는 없어요.

| 파일 | 제목 | 구성 |
|---|---|---|
| `reserve-logs.json` | RESERVE 로그 | 이상 징후 → 서비스 활동 → *추세* → *예약·결제 흐름* → *인증·보안* → *스케줄러* → *오류 분석* → *로그 상세* |
| `reserve-hardware.json` | RESERVE 서버 자원 | 현재 상태 → *메모리 추세* → *CPU·부하·디스크 추세* → *컨테이너 상세* |

- *기울임* 구역은 접혀 있어요. 기본 화면은 짧은 구간의 stat 쿼리만 실행하고, 긴 기간 그래프·표·원문 로그는 펼쳤을 때만 실행해요
- 기본 동시 쿼리 예산은 annotation 포함 로그 10개 이하, 서버 자원 6개 이하예요
- stat 카드에는 미니 그래프를 넣지 않아요. instant와 range를 함께 실행하면 같은 값을 두 번 조회하고 `{metric="..."}`·`Value #A` 같은 내부 이름이 노출돼요
- 로그 건수 쿼리는 `or vector(0)`으로 실제 0건을 만들고, 쿼리 실패는 Grafana 오류 배지로 남겨요. 하드웨어 값은 최근 5분 표본이 없으면 0이 아니라 `수집 없음`으로 보여요
- `로그 검색`은 빈 값으로 시작해요(빈 정규식은 전체와 일치). `레벨`·`영역`의 `전체`는 내부적으로만 정규식을 써요

아래 검사는 JSON 파싱, 패널 ID, 기본 쿼리 예산, stat 단일 instant 쿼리, 접힌 상세 패널, `$__auto`, 데이터 없음 표현을 확인해요. CI의 `build-frontend`에서도 실행돼요.

```bash
node scripts/validate-grafana-dashboards.mjs
```

### 배포 시점이 세로선으로 찍힌다

두 대시보드 모두 `Starting ReserveApplication` 로그를 `배포 시점` annotation으로 잡아서, 모든 그래프에 배포 시각이 세로선으로 보여요. "배포 직후부터 에러가 늘었다", "배포 때 여유 메모리가 여기까지 파인다"를 바로 이을 수 있어요.

### 색을 고른 기준

- 상태색(초록/노랑/주황/빨강)은 ERROR·스왑·메일 실패처럼 "정상이 아님"을 뜻하는 값에만 쓰고, 시리즈 색으로 재사용하지 않아요
- 예약 생성·결제 완료 같은 활동량에는 색을 입히지 않아요. 많고 적음에 좋고 나쁨이 없어요
- 컨테이너 색은 이름을 따라가요. 메모리 순위가 바뀌어도 `green`은 항상 같은 파랑이에요
- stat은 숫자에만 색을 넣어요(`colorMode: value`). 배경을 칠하면 어디를 봐야 할지가 사라져요
- stat은 현재값에 집중하고, 추세선은 접힌 상세 구역에서 봐요

팔레트는 CVD(색각 이상) 검증을 통과한 조합이에요. 색을 바꿀 때 눈으로 고르지 마세요.

### 데이터가 안 보일 때 순서대로 확인

1. **시간 범위**: 트래픽이 적어 6시간 내내 0건인 게 정상일 때가 많아요
2. Explore에서 `{job="reserve"}`를 직접 조회해 대시보드 문제인지 수집 문제인지 갈라요
3. `docker exec loki wget -qO- 'http://localhost:3100/loki/api/v1/label/job/values'` → `["metrics","reserve"]`가 나와야 해요
4. `docker exec promtail cat /tmp/positions.yaml`와 실제 파일 크기를 비교해요

`Status: 500`, `too many outstanding requests`는 데이터 없음이 아니라 Loki 쿼리 큐 과부하예요. 접힌 상세 구역을 모두 닫고 기본 화면부터 확인해요. 긴 기간 그래프는 고정 `[5m]`/`[1h]` 대신 `[$__auto]`를 써요. 그래도 반복되면 한 패널씩 펼쳐 범인을 좁히고, Loki 처리량 조정은 마지막 수단으로 검토해요.

## 알림 규칙

UptimeRobot은 "서비스가 죽었다"만 알려줘요. 아래 규칙은 죽지 않았지만 이상한 상태를 잡아요.

### 알림을 이메일로 받지 않는다

Grafana 알림 메일의 SMTP를 Resend로 잡으면, 메일 장애가 났을 때 "메일이 안 나간다"는 알림도 못 나가요. 감시 대상과 통보 경로가 같으면 감시가 아니에요.

**Discord webhook**을 써요. Alerting → Contact points → Add → Integration `Discord`. 만든 직후 **Test**로 실제 도착을 확인하고, 규칙도 적용 뒤 실제 수신까지 확인해요.

### 규칙

각 규칙은 Query A (Loki, **Instant**) → Expression B (Reduce, Last) → Expression C (Threshold) 구조예요. `Configure no data and error handling`에서 **No data를 `Alerting`**으로 둬요.

**1. 메일 발송 실패** — ABOVE 0 / 10분 주기 / pending 0m

```logql
sum(count_over_time({job="reserve"} |~ `email failed|Email send failed|Mail send failed` [1h]))
```

**2. ERROR 급증** — ABOVE 5 / 5분 주기 / pending 10m

```logql
sum(count_over_time({job="reserve", level="ERROR"} [10m]))
```

이 서비스는 하루 로그가 수십 줄 수준이라 처음 잡은 20으로는 울릴 수 없었어요. 5는 일회성 예외로는 깨우지 않고 반복 실패는 놓치지 않는 선이에요. `pending 10m`은 배포 직후 스파이크로 깨우지 않기 위해서예요.

> 주의: 트래픽이 늘면 임계값도 올려요. 기준은 "평소 10분 ERROR 최대치의 2~3배"이고, "레벨별 로그 추세" 패널에서 읽어요.

**3. 로그인 실패 급증** — ABOVE 30 / 5분 주기 / pending 10m

```logql
sum(count_over_time({job="reserve"} |= `Login failed` [10m]))
```

**4. 지표 수집 중단** — BELOW 1 / 10분 주기

```logql
sum(count_over_time({job="metrics"} [10m]))
```

cron이나 promtail이 죽으면 대시보드가 옛날 값에서 조용히 멈춰요. 화면은 멀쩡한데 숫자가 안 바뀌는 상태가 가장 위험해요.

**5. 미결 환불** — ABOVE 0 / 1시간 주기

```logql
sum(count_over_time({job="reserve"} |= `Refund stuck unresolved` [1h]))
```

자동 재조회로도 결말이 안 난 환불이 있다는 뜻이에요. 손님 돈이 어디 있는지 모르는 상태라 가장 확실하게 사람을 깨울 신호예요. 대응 절차는 `docs/technical/payments.md`의 "미결 환불이 생겼을 때".

**6. 결제 운영 큐 미결** — ABOVE 0 / 15분 주기 / pending 0m

```logql
sum(count_over_time({job="reserve"} |= `Payment operations queue requires attention` [20m]))
```

만료 전 PG 재확인 실패·늦은 PAID·금액 불일치·실패 웹훅 중 하나가 관리자 확인을 기다린다는 뜻이에요. 대응 절차와 조회 API는 `docs/technical/payments.md`의 "결제 대사 큐와 웹훅 inbox".

**7. 백업 미실행** — BELOW 1 / 1시간 주기. 백업 cron 등록과 첫 수동 실행 뒤에 켜요

```logql
sum(count_over_time({job="reserve"} |= `[backup]` |= `=== backup done` [26h])) or vector(0)
```

- 백업은 매일 03:10 KST 1회라, 24시간으로 잡으면 실행이 조금만 밀려도 오탐이 나요
- NoData/Error를 정상으로 무시하지 않고 수집 장애로 알려요. `[backup]`·`ERROR` 로그 1건 이상도 실패 신호로 봐요
- 백업 로그 수집은 동작하지만, 이 규칙·contact point·routing policy는 아직 운영에 적용 전이에요. 운영 쓰기 승인 뒤 적용하고 제어된 실패로 실제 수신을 확인해요

**8. OAuth 탈퇴 연동 해제 미결** — ABOVE 0 / 15분 주기 / pending 0m

```logql
sum(count_over_time({job="reserve"} |= `OAuth unlink queue requires attention` [20m]))
```

> 주의: 예전 문구 `OAuth unlink requires manual follow-up`은 삭제된 이벤트 리스너의 것이라 더는 나오지 않아요. Grafana 규칙 쿼리도 위 문구여야 알림이 살아 있어요.

- 이 알림은 연동 해제 **완료**가 아니라 미결 집계예요. 완료 문구로 안내하지 않아요
- `FAILED`는 암호화된 토큰으로 자동 재시도하고, `BLOCKED`는 탈퇴 시점에 제공자 토큰이 없어 수동 확인이 필요한 상태예요
- 개별 실패 로그가 아니라 15분 운영 집계 문구를 알림 기준으로 써요. 어느 작업인지는 `oauth_unlink_task`의 status·provider·member_id·last_error_type으로 봐요. 토큰은 로그에 남지 않아요

**9. S3 삭제 outbox 실패** — ABOVE 0 / 1시간 주기

```logql
sum(count_over_time({job="reserve"} |= `Queued file deletion failed` [70m]))
```

일시 실패는 지수 backoff로 자동 재시도해요. 반복되면 `file_deletion_task`의 `FAILED` 건수와 `last_error_type`을 확인해요. 경로는 로그로 내보내지 않아요. 상세 런북은 `docs/technical/data-lifecycle.md`의 "S3 파일 삭제 outbox".

### 로그인 유지(refresh) 거절 사유 관측 쿼리 (알림 아님)

"로그인이 풀렸다"는 제보가 오면 먼저 여기를 봐요.

```logql
sum by (reason) (count_over_time({job="reserve"} |= `Refresh rejected` | regexp `reason=(?P<reason>[A-Z_]+)` [24h]))
```

| reason | 뜻 | 보통 원인 |
|---|---|---|
| `MISSING_COOKIE` | refresh 쿠키 자체가 없음 | 브라우저가 쿠키를 지움(Max-Age 만료·사용자 삭제), 이미 로그아웃 |
| `EXPIRED_JWT` / `EXPIRED_SESSION` | 14일 동안 한 번도 쓰지 않음 | 정상 만료 |
| `UNKNOWN_TOKEN` | DB에 없는 토큰 | 다른 기기에서 비밀번호 변경, 기기 5개 초과로 오래된 기기 정리 |
| `AUTH_VERSION_CHANGED` | 비밀번호 변경·재설정 전 토큰 | 정상(보안 의도) |
| `REUSED_TOKEN` (WARN) | 유예(60초)가 지난 직전 토큰 | 탈취 의심 **또는** 응답을 못 받은 네트워크 끊김. 한 회원에 반복되면 확인 |
| `INVALID_JWT` / `NOT_REFRESH_TOKEN` (WARN) | 서명 불일치·용도 위반 | 조작된 요청. JWT 키를 바꾼 직후에도 나옴 |

- 성공은 `Refresh rotated`, 동시 요청 유예 경로는 `Refresh reused within grace`로 남아요. 로그에는 memberId와 사유만 있고 토큰은 없어요
- 거절은 정상 수명 주기에서도 나므로 알림으로 만들지 않아요
- `REUSED_TOKEN`이 정상 사용자에게 자주 보이면 `TokenService.PREVIOUS_TOKEN_GRACE`를 다시 검토해요

### CSP Report-Only 관측 쿼리 (알림 아님)

```logql
{job="reserve"} |= `CSP violation observed`
```

- `RESERVE 로그` 대시보드의 접힌 **인증 · 보안 → 관리자 · 보안 이벤트** 패널에도 같은 추세가 있어요. 기본 화면에서는 실행되지 않으니 관측·분석할 때만 펼쳐요
- `CspReportController`는 브라우저가 보낸 전체 URL을 저장하지 않고 `directive`와 `blockedScheme`만 남겨요
- CSP는 Report-Only를 유지해요. 앱 로그·Promtail positions·level/시각·Loki 스트림이 정상 수집되는지 먼저 확인한 뒤, 결제·지도·Sentry를 포함해 최소 7일 관측해요. 배포 직후 수동 PC·모바일 시나리오도 함께 확인해요
- 쿼리 0건과 스트림 부재를 구분해요. 관측이 끝나기 전에는 Unsplash 허용을 제거하거나 enforcement를 켜지 않아요
- Report-Only 기간에는 예상 위반도 생길 수 있어 즉시 호출 알림으로 만들지 않아요. 강제 전환 기준은 `docs/technical/deployments.md`의 "CSP 위반 관측"

### 왜 "성공 0건"이 아니라 "실패 1건 이상"인가

이 규모에서는 가입·예약·문의가 없어 24시간 메일 발송 성공이 0건인 게 정상이에요. 그걸로 알림을 걸면 매일 울리고 곧 아무도 안 봐요. 실패는 정상 상황에서 0이어야 하고, 메일 장애 때는 첫날부터 쌓였어요. 오탐 없이 사고를 놓치지 않는 조건은 이쪽이에요.

보조로 "성공·실패 합쳐 48시간 0건"(= 발송 시도 자체가 없음)을 걸어둘 수 있어요.

### 문구 의존성

아래 기준 문구를 바꾸면 해당 알림은 사라지지 않고 영영 안 울려요. 로그 문구를 고칠 때 이 표를 같이 봐요.

| 알림 | 유지할 기준 문구 | 문구가 있는 곳 |
|---|---|---|
| 로그인 실패 급증 | `Login failed` | `AuthApiController` |
| 메일 발송 실패 | `email failed`, `Email send failed`, `Mail send failed` 중 하나 | `EmailService`, 비동기 발송 서비스 |
| 미결 환불 | `Refund stuck unresolved` | `RefundReconciliationScheduler` |
| 결제 운영 큐 미결 | `Payment operations queue requires attention` | `PaymentOperationsMonitorScheduler` |
| OAuth 연동 해제 미결 | `OAuth unlink queue requires attention` | `OAuthUnlinkOperationsMonitorScheduler` |
| refresh 거절 사유 관측 | `Refresh rejected: reason=` | `TokenService` |
| CSP Report-Only 관측 | `CSP violation observed` | `CspReportController` |

기준 문구 뒤의 진단값은 바꿀 수 있지만, 이메일·IP·이름·주소·검색어·원본 파일명·토큰·외부 응답 본문·예외 메시지 원문은 붙이지 않아요.

## Logback

`backend/src/main/resources/logback-spring.xml`

- 운영: `/var/log/reserve/app.log`, 30일 rotation
- 로컬: 콘솔만
- 패턴: `%d{yyyy-MM-dd HH:mm:ss} %-5level [%thread] %logger{36} - %msg%n`. 바꾸면 `promtail-config.yml`의 정규식도 같이 바꿔야 해요

컨테이너가 non-root(`appuser`)로 돌아서 디렉토리 소유권이 필요해요.

```bash
sudo mkdir -p /var/log/reserve && sudo chown -R 1000:1000 /var/log/reserve
```

### 로그 개인정보 경계

- 콘솔·파일·Loki 로그에는 직접 식별 가능한 개인정보와 비밀정보를 남기지 않아요
- 문제 추적에는 `memberId`·도메인 엔티티 ID·상태 enum·`errorType`처럼 제한된 값을 써요
- `PiiLogBoundaryTest`가 Java의 일반 `log.*` 호출에서 대표적인 위험 인자와 원문 예외 메시지를 막아요
- 관리자 행위를 보존하는 `audit_log`는 일반 로그와 다른 제한 저장소예요. 감사로그 트랜잭션·접근 통제·보존 정책은 별도 운영 과제로 검증해요

## 미구현 — nginx 로그 수집

`{job="nginx"}`로 429·404·스캐너를 보려면 서버에서 두 가지가 함께 필요해요.

1. nginx가 로그를 진짜 파일로 남기게 해요. 공식 이미지는 `/var/log/nginx/access.log`를 `/dev/stdout`으로 심볼릭 링크해서 파일이 없어요. `nginxserver`를 재생성하며 `-v /var/log/nginx-host:/var/log/nginx`를 추가해야 해요
2. promtail에 그 경로를 read-only로 마운트하고 `nginx` job을 추가해요

1번이 nginx 컨테이너 재생성을 요구해서 미뤘어요. 레포에 job만 넣으면 다시 드리프트가 되니 설정에서 뺐고, 할 때 두 가지를 같이 넣어요.

## Sentry

- 백엔드: `SENTRY_DSN` (GitHub Secrets → docker-compose)
- 프론트: `VITE_SENTRY_DSN` (GitHub Secrets → `.env.production`)

Loki와 역할이 달라요. Sentry는 예외 하나의 스택과 맥락, Loki는 시간에 따른 흐름이에요.

## UptimeRobot

5분 간격으로 `https://reserve.it.kr`를 헬스체크하고, 다운 시 이메일로 알려요.

## SonarCloud

**Automatic Analysis**라 SonarCloud가 저장소를 직접 보고 분석해요. 워크플로에 sonar 스텝도, `sonar-project.properties`도 없어요. 그래서 CI가 실패해도 Sonar는 돌고, Sonar가 실패해도 CI는 막히지 않아요. Quality Gate를 머지 조건으로 쓰려면 브랜치 보호의 필수 체크에 따로 추가해야 해요.
