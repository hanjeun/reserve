# 모니터링

로그와 서버 지표를 Loki 하나로 모으고, Grafana 대시보드와 알림으로 이상 상태를 잡아요.

## 운영 적용 경계

- 2026-10-02 확인: 기존 백업 6줄이 운영 Loki에서 조회된다. 독립 접근으로 내려받은
  `reserve-20260930-181001.sql.gz`는 격리 MySQL 8.0.45에서 현재 main 복원 스크립트로 복원했고,
  34테이블·66행과 34테이블의 `CHECK TABLE` 정상 응답을 확인했다. 별도 보관 키로 사진 한 건을
  복호화한 결과는 사용자가 직접 PASS로 확인했다. 10/2 03:10 KST 정규 백업의 34테이블 검증·
  업로드·정상 종료도 확인했다. 10/3 03:10 KST에는 최소 권한 `reserve_backup` 계정의 정규 실행도
  34테이블·gzip 무결성·업로드·정상 종료와 Loki 로그 6줄로 확인했다.
- 2026-10-02 22:09 KST 운영 호스트를 재부팅했다. 같은 v2.8.3 이미지·최소 권한 앱 계정·
  Hibernate validate를 유지하며 앱·공개 API·Grafana·Loki가 복구됐고, 새 앱·metrics·nginx
  로그를 확인했다. Promtail과 계정 전환 전 앱 컨테이너는 정지 상태를 유지했다.
  새 버전에서 이전 버전으로 돌아오는 실제 릴리스 롤백은 미실행이며, 현재 필수 작업에서 제외한다.
- 운영 `metrics` 스트림에서 `cpu_exec_pct`(us+sy), `cpu_user_pct`, `cpu_system_pct`,
  `cpu_iowait_pct`(wa), `cpu_steal_pct`(st)를 확인했다. 기존 `cpu_pct`는 호환용으로 유지한다.
  운영 대시보드 표시와 알림 전달은 지표 수집과 별도로 확인한다.
- OAuth 알림 정본은 현재 코드의 `OAuth unlink queue requires attention`다. 이것은 연동 해제 **완료**가 아니라
  미결 집계다. 토큰 없는 `BLOCKED`와 재시도 가능한 `FAILED`를 구분하고 완료 문구로 안내하지 않는다.
- CSP는 Report-Only를 유지한다. 앱 로그·Alloy positions·level/시각·Loki 스트림을 확인한 뒤
  결제·지도·Sentry를 포함한 7일 관측을 진행한다. 백업 로그 1건은 CSP 정상 수집 7일의 증거가 아니다.
  쿼리 0건과 스트림 부재를 구분하며 Unsplash 허용을 제거하거나 enforcement를 켜지 않는다.

### 채팅 유예 종료 후 첫 작업 확인 (로컬 보완, 운영 미적용)

2026-10-09 읽기 전용 정책 조회에서도 실제 고지는 `2026-10-04T09:44:15Z`, 적용 시작은 **2026-11-03 18:44:15 KST**이고 90일·30일 유예·`enabled=true`, `active=false`를 유지했어요. 확인을 위해 고지일을 바꾸거나 작업을 앞당기지 않아요.

새 로컬 `ChatRetentionScheduler`는 정책이 활성화되고 신고 → 메시지 → 접근기록 처리가 끝난 경우에만 `Chat retention sweep completed`를 기록해요. `runAtUtc`는 해당 실행의 UTC 시작 시각이며 각 영역의 `Candidates`·`Failures`를 집계해요. 후보 0건도 완료 로그를 남기고, 조회가 실패하면 완료 로그를 남기지 않아요. 이 집계에 회원·방·자료 ID, 본문, 연락처나 예외 메시지를 추가하지 않았어요. 기존 batch 50·10분 주기·항목별 예외 격리·보존 정책은 유지해요. 회귀 검사 소스는 보완했지만 실행하지 않았어요.

유예 종료 후에는 먼저 실제 운영 이미지에 이 코드가 포함됐는지와 정책·로그 스트림을 확인해요. 첫 활성 완료 로그의 시각·후보·실패, 실제 파기 로그·잔여 후보·보류 집계를 대조해요. 서비스의 재확인으로 후보가 남을 수 있으므로 **후보 수 − 실패 수를 실제 파기 수로 계산하지 않아요**. 파일 삭제는 별도 outbox worker와 공유 참조 보호를 거치므로 `file_deletion_task`의 완료·보류·실패와 실제 객체 삭제 결과를 따로 확인해요. 현재 첫 활성 작업·파기·파일 삭제 결과는 아직 확인하지 않았어요.

## 구성

| 도구 | 역할 | 접근 |
|---|---|---|
| **Grafana** | 대시보드 · 알림 | [grafana.reserve.it.kr](https://grafana.reserve.it.kr) |
| **Loki** | 로그 · 지표 저장 | 내부 (포트 3100) |
| **Alloy** | 운영 파일 → Loki 전송, 1.20.1 고정 이미지 | 내부 |
| **Promtail** | 정지 상태로 보존한 이전 수집기·복구 경로 | 내부 |
| **Logback** | Spring Boot 로그 파일 (30일 rotation) | `/var/log/reserve/` |
| **collect-metrics.sh** | 호스트·컨테이너 지표 수집 (cron 1분) | `/var/log/metrics/` |
| **Sentry** | 런타임 에러 트래킹 | [sentry.io](https://sentry.io) |
| **UptimeRobot** | 업타임 모니터링 | [uptimerobot.com](https://uptimerobot.com) |
| **SonarCloud** | Java·프론트 CI 정적 분석 | [sonarcloud.io](https://sonarcloud.io/projects) |

```
Spring Boot ─ Logback ─→ /var/log/reserve/app.log ─┐
cron ─ collect-metrics.sh ─→ /var/log/metrics/*.log ─┴─ Promtail ─→ Loki ─→ Grafana
nginx ─ privacy-safe Docker timing 로그 ─────────────┘
```

## 컨테이너

`docker-compose-monitoring.yml`이 `app-network`에 붙어요. nginx는 `grafana:3000`, Promtail은 `loki:3100`으로 접근해요. 레포 기본 구성은 호스트 포트를 publish하지 않아요. 현재 운영 설치본은 기존 Loki 3100 publish를 유지하며, 승인된 옵션 하나만 바꿨어요. 포트 변경은 별도 운영 승인 대상이에요.

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

### Loki 백업 조회 누락 — 승인된 옵션 적용 (2026-10-02 KST)

2026-09-30 18:00–18:30 UTC의 백업 원본은 6줄인데 운영 조회는 0줄이었다.
격리 reader에서는 같은 저장 데이터를 6줄 읽었고, 승인된 Loki 단독 1회 재시작 뒤
운영 조회도 6줄로 복구됐다. 설정·저장 인덱스의 해시는 바뀌지 않았다.
현재는 조회가 복구된 상태이며, 이것만으로 다음 날짜에도 재발하지 않는다고 판단하지 않는다.

Loki 2.9.0의
[table manager 코드](https://github.com/grafana/loki/blob/v2.9.0/pkg/storage/stores/indexshipper/downloads/table_manager.go)는
공통·tenant별 query-ready 일수가 모두 0이면 주기적인 table-name 캐시 갱신 전에 반환한다.
운영의 두 query-ready 설정은 모두 0이었다. 이 경로가 원인 후보이며,
레포와 운영 Compose에 `-boltdb.shipper.query-ready-num-days=1`을 추가했다.
현재 날짜와 전날의 인덱스를 미리 읽고 기존 5분 resync에서 table 목록도 갱신하도록 하는 후보다.
실제 미래 날짜 전환에서의 효과와 메모리·디스크 비용은 아직 확인하지 않았다.

현재 운영 바이너리의 아래 읽기 전용 검사는 성공했다. `-verify-config=true`는 설정 검증 뒤
서비스 초기화 전에 종료한다. 검사 전후 기존 Loki 시작 시각과 설정 해시가 같았다.

```bash
docker exec loki /usr/bin/loki \
  -config.file=/etc/loki/local-config.yaml \
  -boltdb.shipper.query-ready-num-days=1 \
  -verify-config=true
```

사용자의 이 변경 승인에 따라 10/2 00:02 KST에 Loki만 재생성했다. 이전 Compose는
`/var/backups/reserve-scripts/20261001-before-loki-query-ready/docker-compose-monitoring.yml`에 보존했다.
원본 SHA-256은 `144e9337c41085ecc15c56615036ff50e7c84f23e87ada8e141765d1ef9084a0`,
적용본은 `e27217a2118fd78dd527b5c521c0d28abf6cf3463c1f5cb4def1069a20e8bb1b`다.
이미지 ID·데이터 볼륨·포트·네트워크·restart 정책은 그대로이며, 동일한 고정 시간 구간에서
백업 6줄·앱 로그 4줄의 적용 전후 결과가 일치했고 readiness는 `ready`였다.
00:08 KST 표본에서 Loki 메모리는 44.36 MiB였다. 이 한 번의 표본은 장시간 자원 비용 증거가 아니다.

새 UTC 날짜와 정규 백업의 자연 평가 관측은 남아 있다. 추가 운영 변경은 별도 승인 대상이다.
변경 전에는 서버 Compose와 실제 컨테이너의 이미지·실행 인자·
포트·볼륨을 대조하고 기존 파일을 보존한다. 승인된 차이만 서버 파일에 반영한 뒤 Loki만
재생성한다. 전체 모니터링 스택 재생성, 볼륨 삭제, 캐시 파일 삭제는 이 작업에 포함하지 않는다.
readiness, 기존 6줄, 앱 로그, 새 날짜의 정기 백업과 알림의 다음 자연 평가를 대조하고,
가용 메모리·swap·인덱스 디스크 사용량도 확인한다.
새 로그 누락이나 자원 악화가 생기면 보존한 실행 인자로 Loki만 되돌리고 같은 조회를 반복한다.
기존 데이터 볼륨과 Promtail positions는 유지한다.

### Promtail → Alloy 전환 후보 (운영 미적용)

[Promtail 공식 안내](https://grafana.com/docs/loki/latest/send-data/promtail/)의 지원 종료일은
2026-03-02다. 현재 운영 Promtail 2.9.0을 임의로 제거하지 않고 전환 후보를 먼저 검증했다.
`alloy-config.alloy`는 운영과 동일한 Promtail 설정을 Alloy 1.20.1의 엄격 변환으로 생성했다.
변환 오류 우회 없이 일반 공개 컴포넌트 수준의 `validate`도 통과했다.
`docker-compose-alloy.yml`은 이미지 digest를 고정한 추가 overlay이며 호스트 포트를 열지 않는다.
앱·백업·지표·현재 nginx 로그 디렉터리와 이전 positions는 읽기 전용이고 Alloy 상태만 별도 볼륨에 쓴다.

격리 Linux의 Promtail 2.9.0·Alloy 1.20.1·Loki 2.9.0에서 합성 로그로 다음을 확인했다.
운영 로그나 자격증명은 시험에 쓰지 않았다.

- 네 job의 동일한 7줄이 같은 라벨·본문으로 조회됐다. 앱·백업·nginx의 UTC 시각도 일치했다.
- nginx stderr·1시간보다 오래된 줄·형식 밖 개인정보 표본은 두 수집기 모두 버렸다.
- legacy positions를 가져온 뒤 Alloy를 재시작해도 기존 줄의 재독은 0줄이었다.
  새 파일 두 개와 추가 로그 세 줄만 읽었다.
- Alloy를 중지하고 여섯 파일의 최신 byte offset을 Promtail 형식으로 내보내 되돌렸다.
  Promtail도 기존 줄을 다시 읽지 않았고 이후 추가한 한 줄만 수집했다.

[파일 수집기 공식 문서](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.file/)에 따라
legacy positions는 새 Alloy positions가 없을 때만 가져온다. `--storage.path`와 볼륨을 유지해야 한다.
운영 전환은 다음 순서의 별도 승인 대상이다.

1. 서버의 실제 Compose 두 파일, 네 job, 현재 nginx Docker 로그 디렉터리, 이미지와 볼륨을 대조한다.
   `RESERVE_NGINX_LOG_DIR`에는 `nginxserver`의 현재 로그 디렉터리 하나만 지정한다.
2. Promtail을 정상 중지해 positions를 반영한 뒤 설정과 positions를 보존한다.
   원본 positions 볼륨은 삭제하지 않고 Alloy에 읽기 전용으로 연결한다.
3. 새 Alloy 상태 볼륨에서 Alloy 서비스만 시작한다. 두 수집기를 동시에 실행하지 않는다.
   새 자연 로그의 시각·라벨·개인정보 필터·byte offset과 자원 사용량을 대조한다.
4. 롤백할 때는 Alloy를 먼저 정상 중지한다. `scripts/export-alloy-positions.py`로 중지된
   Alloy 상태 디렉터리의 최신 positions를 **새 후보 파일**에 출력한다. 이 도구는 읽기 전용이며,
   네 source·경로·라벨·형식이 다르거나 파일이 누락되면 실패한다. 원본 snapshot을 덮어쓰지 않는다.
   회전·잘림 여부와 offset을 대조한 뒤에만 Promtail의 현재 positions에 후보를 설치하고 Promtail만 시작한다.
   이 과정에서 Loki의 인덱스·데이터·캐시는 건드리지 않는다.
5. 롤백 뒤 다시 Alloy로 전환할 때 오래된 Alloy 상태를 그대로 재사용하지 않는다.
   기존 상태를 보존하고 새 상태 볼륨으로 최신 Promtail positions를 가져오는 별도 변경안을 검증한다.

내보내기 도구의 거부·우선순위 검사 7건과 격리 왕복 검사는 통과했다. 운영 환경의 파일 회전·
nginx 재생성·자연 날짜 전환과 장시간 메모리 사용은 전환 전후 확인이 남아 있다.

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

아래 쿼리는 설계/런북 예시이고, 설치·평가·실수신 증거를 대신하지 않아요. 2026년 9월 30일 운영 경로는 기존 Resend SMTP를 사용하는 지정된 이메일이에요. TestAlert와 실제 Firing은 별도로 확인해요. SMTP와 앱 메일은 같은 Resend 장애에 영향을 받아요. 사용자의 2026-10-02 선택에 따라 기존 이메일 한 경로를 유지하고, 독립 보조 채널은 추가하지 않아요. 이메일·비밀번호·토큰은 공개 문서에 넣지 않아요.

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

**7. 백업 미실행** — BELOW 1 / 1시간 주기. 운영 설치본은 26시간 창과 No data/Error의 Alerting 처리를 확인했고, 규칙은 활성 상태예요. 다음 정상 정기 실행의 원본 로그·파일/gzip와 새 `job="backup"` Loki 이벤트, 자연 평가와 실제 수신은 별도로 확인해요. 강제 백업이나 positions 초기화로 검증하지 않아요

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

## SonarQube Cloud

2026-10-02부터 `.github/workflows/sonar.yml`의 Java 21·Gradle CI 분석을 사용해요.
자동 분석은 껐고 `SONAR_CI_ENABLED=true`를 적용했어요. `SONAR_TOKEN`은 GitHub Actions
Secret으로만 전달하며 IntelliJ 실행 환경변수에는 필요하지 않아요.

첫 dev 전체 분석은 Java를 포함해 400건을 찾았어요. 이전 57건은 Java가 빠진 범위였어요.
실제 보안·신뢰성 문제를 수정한 뒤 같은 범위를 다시 분석해요. PR 분석과 dev 전체 분석은
별개이며, Quality Gate 통과 전에는 검증 완료라고 표시하지 않아요.

2026-10-03 dev `d455a1a`의 Java 포함 전체 분석은 Quality Gate `OK`, 버그·취약점 0건,
유지보수 지적 85건이에요. 같은 소스의 main 대상 릴리스 분석도 `OK`이고 새 지적은 0건,
변경 코드 커버리지는 81.9%예요. 유지보수 지적은 별도 검토 대상으로 남아 있어요.

같은 날 dev `3a50244`의 전체 분석은 Gate `OK`, 변경 코드 커버리지 81.9%, 미해결 지적
29건이에요. v2.8.5 릴리스 분석은 새 지적·보안 hotspot 0건, 변경 코드 커버리지 83.4%로
통과했어요. 후속 정리에서 사용하지 않는 `CommunityService` import 1건을 제거했어요.
나머지 28건은 IME 조합 입력·구형 복사 fallback·JJWT/AntD API·ReactNode·채팅 키보드 처리·
CLI 결과 출력·순차 재시도/화면 캡처·계산된 색 대비의 기존 계약을 확인해 유지해요.
지적을 숨기거나 Quality Gate 기준을 낮추지 않아요.

CI의 기존 테스트에서 JaCoCo XML과 Vitest LCOV를 만들어요. 같은 입력·도구·성공 실행·해시·
유효기간이 검증된 보고서만 재사용하며, 검증할 수 없으면 새로 생성해요. 임계값을 낮추거나
검사 범위를 줄여서 통과시키지 않아요.

## Alloy 운영 전환

2026-10-02 Alloy 1.20.1의 고정 이미지로 운영 수집을 전환했어요. Promtail을 정상 종료한 뒤
positions를 보존하고, 네 수집원의 offset을 이어받았어요. Promtail 컨테이너·볼륨은 복구용으로
유지하며 Alloy와 동시에 활성화하지 않아요. 기존 Loki 2.9.0·query-ready 옵션·보존기간은 유지해요.
원본 설정과 종료 당시 positions는 `/var/backups/reserve-scripts/20261002-before-alloy/`에 있어요.
롤백할 때는 Alloy를 먼저 멈추고 최신 positions를 내보낸 뒤 Promtail로 돌아가요.

운영 readiness와 새 앱·metrics·nginx 로그는 확인했어요. 앱·백업의 과거 조회도 유지돼요.
2026-10-03 v2.8.4(운영 `2251a9a`)의 첫 heartbeat가 19:34:35 KST에 원본 로그와
Loki에서 확인됐어요. 앱 수집 중단 알림의 일시 중지를 해제하고 Grafana만 재시작했으며,
운영 UI의 Normal·health ok와 기존 9개 규칙의 보존을 확인했어요. 새 서버에 설치할 때도
15분 주기의 `Application log heartbeat: paymentOperations=checked` 수집을 먼저 확인해요.
기존 메일 하나를 유지하고 Resolved 발송도 켜요. 2026-10-02 Gmail 받은편지함에서
19:13 KST 시험 Firing과 19:35 KST 결제 운영 큐 Resolved 수신을 확인했어요.

앱 로그 감시 원본은 `grafana/alerts/reserve-app-log-heartbeat.json`이에요. 설치 시
기존 Loki UID를 대입해요. 45분 동안 heartbeat가 없고 15분 더 지속되면 경고하며,
No data·Error도 Alerting으로 처리해요. 현재 운영에는 활성 상태로 설치했어요.
변경 전 규칙과 Grafana DB는 `/var/backups/reserve-scripts/20261003-before-heartbeat-enable/`에
보존했어요. CSP는 Report-Only를 유지하며, 첫 heartbeat 시각부터 최소 7일간 수집 연속성과
위반을 관측해요. 2026-10-10 19:34:35 KST 이전에는 7일 관측 완료로 판단하지 않아요.
2026-10-03 23:16 KST v2.8.5(`c999f63`)의 green 앱으로 전환한 뒤에도 같은 수집 설정을
유지했어요. 새 앱 heartbeat는 23:16:39 KST에 원본과 Loki 양쪽에서 확인했고,
Actuator health `UP`과 읽기 전용 배포 verifier도 통과했어요. 사진 집계 로그도 두 곳에서
확인했으며, 첫 표본만으로 실제 적중률을 판단하지 않아요. 일일 관측 자동화의 첫 7일 이후
실행은 2026-10-11 19:30 KST예요. 수집 공백이나 CSP 설정 변경이 생기면 관측 기간을 다시 평가해요.
기존 9개 알림은 유지했고, 대시보드·알림 참조가 0건인 URL 없는 Prometheus만
공식 datasource provisioning으로 제거했어요. 변경 전 Grafana DB와 복구 설정은
`/var/backups/reserve-scripts/20261002-before-grafana-cleanup/`에 있어요.


## 장기 성능과 비용의 관측 기준

CPU·메모리는 Loki `job="metrics"`의 1분 표본, nginx 지연은 `job="nginx"`의 JSON 숫자 필드를 사용해요.
한 기간의 모든 요청 지연과 실제 upstream 숫자가 있는 요청 지연은 표본이 다르므로 같은 값으로 비교하지 않아요.
5분 창에서 실제 upstream 요청이 5건 이상인 구간만 CPU steal·swap과 대조하며, 상관계수만으로 원인을 단정하지 않아요.

2026-10-03 조회한 최근 24시간에는 nginx 요청 6,325건, 5xx 일치 로그 0건을 찾았어요.
전체 요청 p95는 0.014초, 유효 upstream 응답 p95는 약 0.219초였어요. 호스트 표본은 각 1,439개이며
실행 CPU 평균 1.489%, I/O 대기 0.129%, steal 6.308%, 메모리 71.683%, 사용 swap 약 659MB였어요.
실제 upstream 요청이 5건 이상인 5분 창 37개에서 지연과 steal·swap의 상관은 각각 -0.034·-0.077이었어요.
이 표본으로 CPU·swap이 지연 원인이라고 확정하거나 서버 사양·JVM 힙을 자동으로 바꾸지 않아요.

최근 성공한 main CI/CD 5회의 작업 실행 시간 합은 4.40·14.42·5.40·5.18·6.05분이었어요.
병렬 작업의 시간 합이며 GitHub 청구 내역·요금이 아니에요. 동일 입력의 성공 증거 재사용은 계속 유지해요.
채팅 메시지 폴링은 숨긴 탭에서 중단하고, 보이는 탭으로 복귀할 때 다시 확인하는 기존 관문을 유지해요.
사진의 실측 적중률과 API 할당량은 [지역 사진의 측정 절차](region-photo-assets.md)를 따라요.
새 집계가 배포되기 전의 빈 로그로 실제 적중률을 계산하지 않아요.

보존·영구 삭제 기간, 광고 노출 보장·순환 정책, 다기기 숨김 등 제품 계약은 기존 동작을 문서로 확인한 뒤
별도로 확정해요. 유지보수 수정이나 측정 작업을 이유로 삭제 worker·새 과금·노출 알고리즘을 활성화하지 않아요.
## 2026-10-04 CSP 수집 확인

14:35 KST 운영 Loki의 최근 7일을 읽기 전용으로 조회했어요. 앱 로그 1,026개와 heartbeat 77개가 있었고,
첫 heartbeat는 10월 3일 19:34:35, 마지막은 10월 4일 14:25:45 KST였어요.
연속 표본은 약 18.85시간이며 최대 간격은 15.02분이에요.
CSP 위반 24개는 모두 과거 기록이고, 가장 최근은 9월 30일 22:33:18 KST예요.
분류는 Kakao eval 18개, HTTPS 이미지 3개, 외부 웹 연결 3개이며, 새 heartbeat 수집 이후 위반은 없었어요.
Report-Only를 유지하며 7일 연속 관측을 완료한 것으로 처리하지 않아요. 실제 운영 롤백 훈련은 현재 필수 작업에서 제외해요.

18:05 KST 추가 조회에서는 10월 3일 19:34:35~10월 4일 18:05:38 KST 창의 앱 로그 186건과
완전한 시간 구간 22개 모두의 수집을 확인했어요. 이 창에는 CSP 보고 10건이 있었어요.
모두 HTTPS 이미지이며 발생 소스 분류는 `first-party` 6건·`unknown` 4건이에요.
차단 대상 도메인은 수집하지 않으므로 이 분류를 차단 대상의 출처나 실제 원인으로 해석하지 않아요.
위반 0건이나 7일 연속 관측 완료로 표시하지 않고 Report-Only를 유지해요.
