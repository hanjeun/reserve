# 모니터링

---

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

---

## ★ 이 스택이 존재하는 이유 — 2026-07-29 메일 3주 무단 중단

> 코드에서 이 문서를 가리키는 지점: `EmailService` 클래스 주석, `AsyncConfig`.
> **`EmailService` 의 catch 절에서 `MailException` 을 지우면 이 사고가 그대로 재현된다.**

**무슨 일이 있었나.** 유출로 폐기된 Resend 키가 서버에 남아 있어 SMTP 가
`535 Authentication credentials invalid` 를 돌려주고 있었다. 그런데 화면에는 계속
"발송되었습니다" 가 떴고, **3주 동안 회원가입 인증·비밀번호 재설정·예약 알림 메일이 전부 죽어 있었다.**

**왜 아무도 몰랐나.** 두 겹으로 숨었다.

1. `mailSender.send()` 는 `MessagingException` 을 던지지 않는다. Spring 이 전부
   `MailException`(`MailAuthenticationException` · `MailSendException`)으로 감싸는데,
   그건 `RuntimeException` 이라 당시의 `catch (MessagingException | UnsupportedEncodingException)` 에
   **걸리지 않았다.**
2. 발송 메서드는 `@Async` 라 예외가 호출자에게 전파되지도 않았다.

**교훈은 "로그를 남기자" 가 아니다.** 실패 로그는 첫날부터 쌓이고 있었다(총 13건).
**아무도 그 로그를 보지 않았다는 것**이 진짜 원인이고, 그래서 이 모니터링 스택이 생겼다.
사람이 로그 파일을 열어보는 절차는 반드시 실패한다 — 기계가 깨워야 한다.

**지금 걸려 있는 방어는 세 겹이다.**

| 겹 | 위치 | 역할 |
|---|---|---|
| ① | `EmailService` 의 catch 절에 포함된 `MailException` | 실패를 도메인 로그로 남긴다 |
| ② | `AsyncConfig` 의 `AsyncUncaughtExceptionHandler` | ①을 빠져나가는 것까지 잡는다 |
| ③ | 아래 "알림 규칙 1. 메일 발송 실패" | 그 로그를 **사람에게 밀어준다** |

③이 없으면 ①·②는 "잘 기록된 채로 아무도 모르는 장애"를 만들 뿐이다.
알림을 "성공 0건"이 아니라 "실패 1건 이상"으로 건 이유는 아래 별도 절에 있다.

---

## ★ 왜 Prometheus 가 없는가

CPU·메모리를 보는 표준 조합은 Prometheus + node_exporter 다. **이 서버에는 넣으면 안 된다.**

```
전체 1907MB / 여유 약 620MB / 스왑 이미 600MB 사용 중
Spring Boot 컨테이너 하나가 약 600MB
```

블루/그린 배포는 그 600MB짜리를 **하나 더** 띄운다. 여유에서 빼면 20MB 남짓이고,
스왑을 600MB 쓰고 있는 게 그 흔적이다. 여기에 Prometheus(170~300MB)를 얹으면
**배포 도중 OOM 으로 컨테이너가 죽을 수 있다.**

그래서 cron 이 1분마다 `vmstat`·`free`·`df`·`docker stats` 를 logfmt 로 찍고
**이미 있는 Loki 가 그대로 수집**한다. 상주 메모리 0, 추가 컨테이너 0.
`docker stats` 를 쓰므로 컨테이너별 지표까지 나온다 — cAdvisor 없이.

**대가**: 해상도가 1분 고정이라 순간 스파이크는 못 잡는다.
"배포 때 메모리가 어디까지 차는가", "스왑이 언제부터 늘었나" 는 정확히 보인다.

서버를 키우면 그때 Prometheus 로 바꾼다. 지금 판단은 **메모리 여유가 없다**는 실측에 근거한다.

---

## ★★ Promtail 타임스탬프 — 이 스택 최대의 함정

**2026-08-19 이전까지 Grafana 에 찍히던 시간은 전부 거짓이었다.**

Promtail 은 기본적으로 로그 줄 안의 시각을 읽지 않고 **자기가 읽은 순간**을 타임스탬프로 쓴다.
평소에는 실시간 tail 이라 차이가 작지만, promtail 이 재시작하면 파일을 처음부터 다시 읽어
**하루치 로그가 1초 안에 전부 쌓인다.** 대시보드는 멀쩡히 렌더되고, 숫자만 틀린다.

`promtail-config.yml` 의 `pipeline_stages` 가 이걸 막는다. **지우지 말 것.**

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

- **`location: UTC`** — 앱 컨테이너가 UTC 로 돈다. KST 로 잘못 적으면 전부 9시간 밀린다.
  확인: 서버 `date` 와 `tail -1 /var/log/reserve/app.log` 의 시각이 같으면 UTC 다
- **`level` 라벨** — 대시보드가 이걸로 거른다. 인덱스 라벨이라 라인 스캔보다 훨씬 싸고,
  메시지 본문에 "ERROR" 가 들어갔다고 오탐하지 않는다
- **logback 패턴을 바꾸면 이 정규식도 바꿔야 한다.** 안 그러면 타임스탬프가 조용히
  수집 시각으로 되돌아간다 — 아무것도 깨지지 않고, 숫자만 다시 거짓이 된다

검증 (배포·설정 변경 뒤 한 번):

```
{job="reserve"}
```

Grafana 왼쪽 시각과 줄 안의 시각이 **일치**해야 한다. 전부 같은 값으로 뭉쳐 있으면 실패다.

---

## ★★★ Loki 는 과거 로그를 받지 않는다

각 스트림은 **가장 최근 엔트리로부터 약 1시간** 밖의 타임스탬프를 거부한다
(`unordered_writes` 윈도우). 조용히 버려지고, promtail 로그에도 아무것도 안 남는다.

**즉 백필이 불가능하다.** 실제로 2026-08-19 에 확인했다 — promtail 이 `app.log` 를
끝까지 읽고 positions 까지 갱신했는데 Loki 에는 한 줄도 없었다.

**과거 로그를 봐야 할 때는 Loki 를 뒤지지 말고 서버에서 직접 본다:**

```bash
zgrep 'ERROR' /var/log/reserve/app.2026-07-29.0.log.gz
zgrep -c 'Email send failed' /var/log/reserve/app.*.log.gz
```

7월 메일 장애의 원인도 이 방법으로 찾았다. Loki 는 **지금부터 앞으로**를 위한 것이다.

---

## 컨테이너 구성

`docker-compose-monitoring.yml`. `app-network` 에 붙어 Spring Boot 컨테이너와 통신한다.
Grafana와 Loki는 호스트 포트를 publish하지 않는다. nginx는 `grafana:3000`, Promtail은 `loki:3100`으로
같은 Docker 네트워크에서 직접 접근하므로 3000·3100을 `0.0.0.0`에 열 필요가 없다.

2026-09-02 읽기 전용 확인 당시 운영 컨테이너는 두 포트를 호스트 전체 인터페이스에 publish하고 있었지만
Lightsail 외곽 방화벽이 외부 접속을 차단하고 있었다. 이 Compose 변경은 방화벽이 실수로 풀려도 직접
노출되지 않게 하는 2차 방어선이며, **서버 파일 교체와 컨테이너 재생성 전까지 운영에는 반영되지 않는다.**

```bash
docker compose -f ~/docker-compose-monitoring.yml up -d
docker ps | grep -E "loki|promtail|grafana"
```

### 볼륨 세 개 — 전부 없으면 안 된다

| 볼륨 | 없으면 |
|---|---|
| `grafana-data` | 대시보드·알림 규칙이 컨테이너와 함께 사라진다 |
| `loki-data` | **로그 전체가 사라진다.** 컨테이너 재생성 한 번이면 끝 |
| `promtail-positions` | 재시작마다 전체 파일을 재전송한다 (위 타임스탬프 함정과 결합하면 치명적) |

`loki-data` 와 `promtail-positions` 는 2026-08-19 에 추가했다. 그전까지는
**모니터링 스택을 건드릴 때마다 로그가 날아가는 상태**였고 아무도 몰랐다.

### ⚠️ 레포 ↔ 서버 드리프트

`promtail-config.yml` 은 **서버의 `~/promtail-config.yml` 이 마운트된다.**
레포만 고치면 반영되지 않는다.

```bash
scp promtail-config.yml ubuntu@<서버>:~/
docker restart promtail
```

실제로 이것 때문에 레포에만 있던 nginx job 이 서버에 없는 채로 방치됐고,
`{job="nginx"}` 로 429·스캐닝을 보려던 계획이 **처음부터 0건**이었다.

**설정을 바꾼 뒤에는 서버에서 실제로 반영됐는지 확인할 것:**

```bash
grep 'job_name' ~/promtail-config.yml
docker exec promtail ls /var/log/metrics
```

---

## 지표 수집 (collect-metrics.sh)

`scripts/collect-metrics.sh` 가 원본이고, 서버 `~/collect-metrics.sh` 로 배포한다.

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

마지막 줄은 **멱등**하다 — 여러 번 실행해도 중복 등록되지 않는다.

### 출력 형식 — 지표 하나당 한 줄인 이유

```
kind=host metric=mem_available_mb value=617
kind=container name=green metric=mem_mb value=600.6
```

Loki 의 `unwrap` 은 **지정한 필드 외 나머지를 전부 라벨로 남긴다.** 한 줄에 지표를 모아 담으면
`unwrap cpu_pct` 할 때 `load1`·`mem_used_mb` 가 라벨이 되는데, 그 값들이 매 샘플 바뀌므로
**샘플마다 새로운 시계열이 생겨 그래프가 점으로만 찍힌다.**
`metric=<이름> value=<숫자>` 로 쪼개면 남는 라벨이 안정적인 것뿐이다.

타임스탬프 필드를 안 넣는 것도 같은 이유다. Loki 가 어차피 수집 시각을 갖는다.

### 쿼리에 `by (...)` 가 필요한 이유

파일명이 날짜별로 바뀌므로 `filename` 라벨이 자정에 달라진다. 그대로 두면 **자정마다 선이 끊긴다.**

```logql
avg_over_time({job="metrics"} | logfmt | kind=`host` | metric=`mem_used_pct` | unwrap value [5m]) by (metric)
avg_over_time({job="metrics"} | logfmt | kind=`container` | metric=`mem_mb`  | unwrap value [5m]) by (name)
```

---

## 대시보드

`grafana/dashboards/*.json`. Grafana → Dashboards → New → **Import** →
파일 업로드 → **하단 Loki 데이터소스 선택** (이걸 빠뜨리면 전 패널이 "Datasource not found") → Import.

같은 uid 가 이미 있으면 **Import (Overwrite)** 를 누른다. 삭제 후 재import 할 필요 없다.

| 파일 | 제목 | 구성 |
|---|---|---|
| `reserve-logs.json` | RESERVE 로그 | 이상 징후 → 서비스 활동 → *추세* → *예약·결제 흐름* → *인증·보안* → *스케줄러* → *오류 분석* → *로그 상세* |
| `reserve-hardware.json` | RESERVE 서버 자원 | 현재 상태 → *메모리 추세* → *CPU·부하·디스크 추세* → *컨테이너 상세* |

*기울임* 표시한 구역은 **접혀 있다.** 기본 화면은 짧은 고정 구간을 읽는 stat 쿼리만 실행하고,
긴 기간을 스캔하는 그래프·표·원문 로그는 사용자가 해당 구역을 펼쳤을 때만 실행한다.

기본 동시 쿼리 예산은 annotation을 포함해 로그 10개 이하, 서버 자원 6개 이하다. 현재 JSON은 각각
9개와 5개다. 아래 명령은 JSON 파싱, 패널 ID, 기본 쿼리 예산, stat 단일 instant 쿼리,
접힌 상세 패널, `$__auto`, 데이터 없음 표현을 함께 검사한다. CI의 `build-frontend`에서도 실행한다.

```bash
node scripts/validate-grafana-dashboards.mjs
```

stat 카드에는 미니 그래프를 넣지 않는다. 한 카드에서 instant와 range를 함께 실행하면 같은 값을
두 번 조회하고 `{metric="..."}`·`Value #A` 같은 내부 이름이 화면에 노출된다. 로그 건수 쿼리는
`or vector(0)`으로 **실제 0건**을 만들고, 쿼리 실패는 Grafana 오류 배지로 남긴다. 하드웨어 값은
최근 5분 표본이 없으면 0이 아니라 `수집 없음`으로 표시한다.

> **2026-09-05 운영 상태:** 로컬 JSON은 검증 스크립트에서 로그 9/10, 서버 자원 5/6 쿼리 예산으로
> 통과했다. 그러나 운영 Grafana DB의 대시보드는 각각 version 5와 version 1로, 새 JSON을 아직
> overwrite import하지 않았다. 운영 Grafana 로그인 뒤 두 파일을 가져오고 실제 화면을 확인하기
> 전까지는 새 디자인과 장기 범위 쿼리가 운영에 반영됐다고 보지 않는다.

`로그 검색`은 빈 값으로 시작한다. 빈 정규식은 전체 로그와 일치하므로 예전 기본값 `.*`를 사용자가
볼 필요가 없다. `레벨`과 `영역`의 `전체` 선택값은 내부적으로만 정규식을 사용한다.

### ★ 배포 시점이 세로선으로 찍힌다

두 대시보드 모두 `Starting ReserveApplication` 로그를 `배포 시점` annotation 으로 잡는다.
**모든 그래프에 배포 시각이 세로선으로 표시된다.**

이게 있으면 "배포 직후부터 에러가 늘었다", "배포 때 여유 메모리가 여기까지 파인다" 를
눈으로 바로 잇는다. 없으면 매번 로그를 뒤져 배포 시각을 찾아야 한다.

### 색을 고른 기준

- **상태색**(초록/노랑/주황/빨강)은 **상태에만** 쓴다. ERROR·스왑·메일 실패처럼
  "정상이 아님"을 뜻하는 값에만 올라오고, 시리즈 색으로는 절대 재사용하지 않는다
- **예약 생성·결제 완료 같은 활동량에는 색을 입히지 않는다.** 많고 적음에 좋고 나쁨이 없기 때문이다.
  색을 칠하면 의미가 있는 것처럼 보이는데 실제로는 아무 의미도 없다
- **컨테이너 색은 이름을 따라간다.** 메모리 순위가 바뀌어도 `green` 은 항상 같은 파랑이다.
  순위로 색을 주면 재배치될 때마다 다른 컨테이너로 착각한다
- stat 은 **숫자에만 색**을 넣는다(`colorMode: value`). 배경을 칠하면 여덟 칸이 전부 소리를 질러서
  **어디를 봐야 하는지가 사라진다**
- stat은 현재값 확인에 집중하고, 추세선은 접힌 상세 구역에서 확인한다

팔레트는 CVD(색각 이상) 검증을 통과한 조합이다. 색을 바꿀 때는 눈으로 고르지 말 것.

### 데이터가 안 보일 때 순서대로 확인

1. **시간 범위** — 트래픽이 적어 6시간 내내 로그가 0건인 게 정상일 때가 많다
2. `{job="reserve"}` 를 Explore 에서 직접 — 대시보드 문제인지 수집 문제인지 가른다
3. `docker exec loki wget -qO- 'http://localhost:3100/loki/api/v1/label/job/values'`
   → `["metrics","reserve"]` 가 나와야 한다
4. `docker exec promtail cat /tmp/positions.yaml` 와 실제 파일 크기 비교

`Status: 500`, `too many outstanding requests`가 보이면 데이터 없음이 아니라 Loki 쿼리 큐 과부하다.
먼저 접힌 상세 구역을 모두 닫고 기본 화면을 확인한다. 긴 기간 그래프는 고정 `[5m]`/`[1h]` 대신
`[$__auto]`를 사용해 Grafana가 화면 범위와 해상도에 맞는 구간을 고르게 한다. 그래도 반복되면
한 패널씩 펼쳐 범인을 좁히고 Loki 처리량 조정은 마지막 수단으로 검토한다.

---

## 알림 규칙

> UptimeRobot 은 **"서비스가 죽었다"만** 알려준다. 아래는 **죽지 않았지만 이상한** 상태를 잡는다.

### ⚠️ 알림을 이메일로 받지 말 것

Grafana 알림 메일은 SMTP 를 탄다. 그 SMTP 를 Resend 로 잡으면 2026-07-29 같은 사고가 났을 때
**"메일이 안 나간다"는 알림도 메일로 못 나간다.** 감시 대상과 통보 경로가 같으면 감시가 아니다.

→ **Discord webhook** 을 쓴다. Alerting → Contact points → Add → Integration `Discord`.
만든 직후 **Test** 로 실제 도착을 확인할 것. 도착을 확인하지 않은 알림은 없는 알림과 같다.

### 규칙

각 규칙은 Query A (Loki, **Instant**) → Expression B (Reduce, Last) → Expression C (Threshold) 구조다.
`Configure no data and error handling` 에서 **No data 를 `Alerting`** 으로 둔다.

**1. 메일 발송 실패** — ABOVE 0 / 10분 주기 / pending 0m

```logql
sum(count_over_time({job="reserve"} |~ `email failed|Email send failed|Mail send failed` [1h]))
```

**2. ERROR 급증** — ABOVE 5 / 5분 주기 / pending 10m

```logql
sum(count_over_time({job="reserve", level="ERROR"} [10m]))
```

**임계값을 20 → 5 로 내렸다 (2026-08-19).** 처음에 20으로 잡은 건 "평소치를 모르니 넉넉하게"였는데,
스택을 띄우고 실측해 보니 이 서비스는 **하루 로그가 통째로 수십 줄** 수준이다
(배포 직후 `wc -l /var/log/reserve/app.log` = 4). 10분 안에 ERROR 20건이 쌓이려면
이미 서비스가 완전히 넘어간 뒤여야 한다 — **울릴 수 없는 알림은 없는 알림과 같다.**
5는 "한두 건의 일회성 예외로는 안 깨우되, 반복되는 실패는 놓치지 않는" 선이다.
`pending 10m` 은 배포 직후 스파이크로 깨우지 않기 위한 것이다.

> 트래픽이 늘면 이 숫자도 같이 올려야 한다. 기준은 "평소 10분 ERROR 최대치의 2~3배" —
> "레벨별 로그 추세" 패널에서 읽는다.

**3. 로그인 실패 급증** — ABOVE 30 / 5분 주기 / pending 10m

```logql
sum(count_over_time({job="reserve"} |= `Login failed` [10m]))
```

**4. 지표 수집 중단** — BELOW 1 / 10분 주기

```logql
sum(count_over_time({job="metrics"} [10m]))
```

**5. 미결 환불** — ABOVE 0 / 1시간 주기 (2026-08-23 추가)

```logql
sum(count_over_time({job="reserve"} |= `Refund stuck unresolved` [1h]))
```

자동 재조회로도 결말이 안 난 환불이 있다는 뜻이다. **이 프로젝트에서 사람을 깨울 이유가
가장 확실한 신호** — 손님 돈이 어디 있는지 아무도 모르는 상태다.
대응 절차는 `docs/technical/payments.md` 의 "미결 환불이 생겼을 때".

**6. 결제 운영 큐 미결** — ABOVE 0 / 15분 주기 / pending 0m

```logql
sum(count_over_time({job="reserve"} |= `Payment operations queue requires attention` [20m]))
```

만료 전 PG 재확인 실패·늦은 PAID·금액 불일치·실패 웹훅 중 하나가 관리자 확인을 기다린다는 뜻이다.
대응 절차와 조회 API는 `docs/technical/payments.md`의 "결제 대사 큐와 웹훅 inbox".

**7. 백업 미실행** — BELOW 1 / 1시간 주기. **백업 cron 등록 + 첫 수동 실행 뒤에 켤 것**

```logql
sum(count_over_time({job="reserve"} |~ `\[backup\] === backup done` [26h]))
```

26시간인 이유: 백업은 매일 03:10 KST 1회다. 24시간이면 실행이 조금만 밀려도 오탐이 난다.

**8. OAuth 탈퇴 연동 해제 실패** — ABOVE 0 / 15분 주기 / pending 0m

```logql
sum(count_over_time({job="reserve"} |= `OAuth unlink requires manual follow-up` [20m]))
```

DB 탈퇴는 커밋됐지만 외부 제공자 연동 해제는 확인이 필요한 상태다. member ID와 provider만 보고
해당 제공자 콘솔에서 수동 확인한다. 토큰은 로그에 남지 않는다.

**9. S3 삭제 outbox 실패** — ABOVE 0 / 1시간 주기

```logql
sum(count_over_time({job="reserve"} |= `Queued file deletion failed` [70m]))
```

일시 실패는 지수 backoff로 자동 재시도한다. 반복되면 `file_deletion_task`의 `FAILED` 건수와
`last_error_type`을 확인한다. 경로 자체는 로그로 내보내지 않는다. 상세 런북은
`docs/technical/data-lifecycle.md`의 "S3 파일 삭제 outbox"를 따른다.

### CSP Report-Only 관측 쿼리 (알림 아님)

```logql
{job="reserve"} |= `CSP violation observed`
```

`RESERVE 로그` 대시보드의 접힌 **인증 · 보안 → 관리자 · 보안 이벤트** 패널에도 같은 이벤트의
추세가 있다. 기본 화면에서는 실행되지 않으므로 7일 관측이나 원인 분석이 필요할 때만 펼친다.

`CspReportController`는 브라우저가 보낸 전체 URL을 저장하지 않고 `directive`와
`blockedScheme`만 남긴다. 배포 직후 수동 PC·모바일 시나리오와 최소 7일 관측을 함께 확인한다.
Report-Only 기간에는 예상 위반도 생길 수 있으므로 이 쿼리를 즉시 호출 알림으로 만들지 않는다.
강제 전환 기준은 `docs/technical/deployments.md`의 "CSP 위반 관측"을 따른다.

### 왜 "성공이 0건"이 아니라 "실패가 1건 이상"인가

처음에는 "6시간 동안 메일 발송 성공이 0건이면 알림"으로 잡으려 했다.
그런데 대시보드를 켜 보니 **최근 24시간 성공이 실제로 0건**이었다 — 장애가 아니라
그 사이 가입·예약·문의가 없었을 뿐이다. 이 규모에서 "성공이 없다"는 **정상 상태**이므로,
그걸로 알림을 걸면 매일 울리고 곧 아무도 안 본다.

실패는 다르다. 정상 상황에서 0이어야 하고, 2026-07-29 사고에서는 첫날부터 쌓였다(총 13건).
**오탐 없이 사고를 놓치지 않는 조건은 이쪽이다.**

보조로 "성공·실패 합쳐 48시간 0건"(= 발송 시도 자체가 없음)을 걸어둘 수 있다.

### 왜 "지표 수집 중단"이 필요한가

cron 이나 promtail 이 죽으면 대시보드가 **옛날 값에서 조용히 멈춘다.**
화면은 멀쩡해 보이는데 숫자가 안 바뀌는 상태가 제일 위험하다 — 메일 사고와 같은 구조다.

### 문구 의존성

**아래 알림 기준 문구를 바꾸면 해당 알림은 사라지지 않고 영영 안 울린다.**

| 알림 | 유지할 기준 문구 | 문구가 있는 곳 |
|---|---|---|
| 로그인 실패 급증 | `Login failed` | `AuthApiController` |
| 메일 발송 실패 | `email failed`, `Email send failed`, `Mail send failed` 중 하나 | `EmailService`, 비동기 발송 서비스 |
| 미결 환불 | `Refund stuck unresolved` | `RefundReconciliationScheduler` |
| 결제 운영 큐 미결 | `Payment operations queue requires attention` | `PaymentOperationsMonitorScheduler` |
| CSP Report-Only 관측 | `CSP violation observed` | `CspReportController` |

기준 문구 뒤의 진단값은 바꿀 수 있지만 이메일·IP·이름·주소·검색어·원본 파일명·토큰·외부 응답
본문·예외 메시지 원문은 붙이지 않는다. 로그 문구를 고칠 때 이 문서를 같이 볼 것.

---

## Logback

`backend/src/main/resources/logback-spring.xml`.

- 운영: `/var/log/reserve/app.log`, 30일 rotation
- 로컬: 콘솔만
- 패턴: `%d{yyyy-MM-dd HH:mm:ss} %-5level [%thread] %logger{36} - %msg%n`
  → **이 패턴을 바꾸면 `promtail-config.yml` 의 정규식도 같이 바꿔야 한다**

### 로그 개인정보 경계

- 콘솔·파일·Loki 로그에는 직접 식별 가능한 개인정보와 비밀정보를 남기지 않는다.
- 문제 추적에는 `memberId`·도메인 엔티티 ID·상태 enum·`errorType`처럼 제한된 값을 사용한다.
- `PiiLogBoundaryTest`가 Java의 일반 `log.*` 호출에서 대표적인 위험 인자와 원문 예외 메시지를 막는다.
- 관리자 행위를 보존하는 `audit_log`는 일반 로그와 다른 제한 저장소다. 감사로그 트랜잭션·접근 통제·보존 정책은 별도 운영 과제로 검증한다.

컨테이너가 non-root(`appuser`)로 돌므로 디렉토리 소유권이 필요하다:

```bash
sudo mkdir -p /var/log/reserve && sudo chown -R 1000:1000 /var/log/reserve
```

---

## 미구현 — nginx 로그 수집

`{job="nginx"}` 로 429·404·스캐너를 보려면 **서버에서 두 가지가 선행돼야 한다.**

1. nginx 가 로그를 진짜 파일로 남기게 한다. 공식 이미지는 `/var/log/nginx/access.log` 를
   `/dev/stdout` 으로 심볼릭 링크해 둬서 **파일이 존재하지 않는다.**
   `nginxserver` 를 재생성하며 `-v /var/log/nginx-host:/var/log/nginx` 를 추가해야 한다
2. promtail 에 그 경로를 read-only 로 마운트하고 `nginx` job 을 추가한다

**1번이 nginx 컨테이너 재생성을 요구해서 미뤘다.** 레포에 job 만 넣어두면 다시 드리프트가 되므로,
설정에서 아예 뺐다. 실제로 할 때 두 가지를 같이 넣을 것.

---

## Sentry

- 백엔드: `SENTRY_DSN` (GitHub Secrets → docker-compose)
- 프론트: `VITE_SENTRY_DSN` (GitHub Secrets → `.env.production`)

2026-09-05 백엔드 DSN은 실행 중이던 운영 컨테이너의 유효 값을 노출하지 않는 stdin 경로로
repository secret에 갱신했고, 같은 커밋 재배포 뒤 애플리케이션 정상 기동을 확인했다. GitHub는
저장된 secret 원문을 다시 보여주지 않으므로 값 자체가 아니라 갱신 시각과 배포 결과를 증거로 남긴다.

Loki 와 역할이 다르다. Sentry 는 **예외 하나의 스택과 맥락**, Loki 는 **시간에 따른 흐름**이다.

---

## UptimeRobot

5분 간격 `https://reserve.it.kr` 헬스체크. 다운 시 이메일.

---

## SonarCloud

**Automatic Analysis** — SonarCloud 가 저장소를 직접 보고 분석한다.
워크플로에 sonar 스텝이 없고 `sonar-project.properties` 도 없다.
즉 **CI 가 실패해도 Sonar 는 돌고, Sonar 가 실패해도 CI 는 막히지 않는다.**
Quality Gate 를 머지 조건으로 쓰려면 브랜치 보호의 필수 체크에 별도로 추가해야 한다.
