# 모니터링

---

## 구성 요약

| 도구 | 역할 | 접근 |
|---|---|---|
| **Grafana** | 로그 대시보드 시각화 | [grafana.reserve.it.kr](https://grafana.reserve.it.kr) |
| **Loki** | 로그 수집 · 저장 | 내부 (포트 3100) |
| **Promtail** | 로그 파일 → Loki 전송 | 내부 |
| **Logback** | Spring Boot 로그 파일 생성 (30일 rotation) | `/var/log/reserve/` |
| **Sentry** | 런타임 에러 트래킹 | [sentry.io](https://sentry.io) |
| **UptimeRobot** | 서비스 업타임 모니터링 | [uptimerobot.com](https://uptimerobot.com) |
| **SonarCloud** | 코드 품질 · 보안 정적 분석 | [sonarcloud.io](https://sonarcloud.io/projects) |

---

## 로그 수집 흐름

```
Spring Boot
  └─ Logback → /var/log/reserve/app.log (30일 rotation)
                      │
                   Promtail
                      │
                    Loki :3100
                      │
                   Grafana
              grafana.reserve.it.kr
```

---

## 컨테이너 구성

`docker-compose-monitoring.yml`로 관리되며 `app-network`에 연결되어 Spring Boot 컨테이너와 통신합니다.

```
app-network
  ├── loki      → :3100 (내부 전용)
  ├── promtail  → /var/log/reserve 마운트 (read-only)
  └── grafana   → :3000 (Nginx 리버스 프록시로 외부 노출)
```

### 실행

```bash
# 서버에서
docker compose -f ~/docker-compose-monitoring.yml up -d

# 상태 확인
docker ps | grep -E "loki|promtail|grafana"
```

---

## Grafana

**접속:** https://grafana.reserve.it.kr

### 데이터 소스

Connections → Data sources → Loki

| 항목 | 값 |
|---|---|
| URL | `http://loki:3100` |
| 인증 | 없음 (내부 네트워크) |

### RESERVE Monitoring 대시보드

| 패널 | 쿼리 | 타입 |
|---|---|---|
| Error Logs | `{job="reserve"} \|= "ERROR"` | Logs |
| Application Logs | `{job="reserve"}` | Logs |
| Log Volume | `count_over_time({job="reserve"}[5m])` | Time series (Range) |

---

## 알림 규칙 (Grafana Alerting)

> UptimeRobot 은 **"서비스가 죽었다"만** 알려준다. 아래 세 개는 **죽지 않았지만 이상한** 상태를 잡는다.

### 0. 먼저 — 알림 받을 곳(Contact point)

Grafana → Alerting → Contact points → **Add contact point**

| 항목 | 값 |
|---|---|
| Name | `reserve-admin` |
| Integration | Email |
| Addresses | 관리자 이메일 |

⚠️ Grafana 컨테이너에 SMTP 설정이 없으면 메일이 **조용히 안 간다.**
`docker-compose-monitoring.yml` 의 grafana 서비스에 아래를 추가하고 재기동한다
(값은 백엔드가 쓰는 메일 계정과 같은 걸 써도 된다).

```yaml
      - GF_SMTP_ENABLED=true
      - GF_SMTP_HOST=${MAIL_HOST}:${MAIL_PORT}
      - GF_SMTP_USER=${MAIL_USERNAME}
      - GF_SMTP_PASSWORD=${MAIL_PASSWORD}
      - GF_SMTP_FROM_ADDRESS=${MAIL_USERNAME}
      - GF_SMTP_FROM_NAME=RESERVE Grafana
```

설정 후 Contact point 화면의 **Test** 버튼으로 실제 수신까지 확인할 것.
테스트 메일이 안 오면 알림 규칙을 아무리 만들어도 의미가 없다.

### 1. 백업이 안 돌고 있다 (최우선)

**"실패하면 알림"이 아니라 "성공이 없으면 알림"으로 잡는다.**
그래야 cron 자체가 죽은 경우·디스크가 가득 차 스크립트가 시작도 못한 경우까지 잡힌다.
실패 알림만 걸면 "아무 알림도 안 오네 = 잘 돌고 있네"로 오해한다.

| 항목 | 값 |
|---|---|
| Query (Loki) | `count_over_time({job="reserve"} \|= "[backup] === backup done" [26h])` |
| Condition | `IS BELOW 1` |
| Evaluate every | `1h` / for `0m` |
| Summary | 최근 26시간 동안 MySQL 백업 성공 기록이 없습니다 |

> 26시간인 이유: 백업은 매일 03:10 KST 1회다. 24시간으로 잡으면 실행 시각이 조금만
> 밀려도 오탐이 난다. 2시간 여유를 둔다. **백업 cron 을 등록하기 전에 이 규칙을
> 먼저 만들면 계속 울린다** — cron 등록 + 첫 수동 실행까지 끝난 뒤에 켜는 것.

### 2. 로그인 실패 급증 (크리덴셜 스터핑 징후)

Rate limiter 가 막아도 **막고 있다는 사실 자체를 알아야** 대응할 수 있다.

| 항목 | 값 |
|---|---|
| Query (Loki) | `sum(count_over_time({job="reserve"} \|= "Login failed" [10m]))` |
| Condition | `IS ABOVE 30` |
| Evaluate every | `5m` / for `10m` |

> `for 10m` 을 두는 이유: 순간 스파이크 한 번에 깨우지 않게 한다.
> 실제 로그 문구는 `AuthApiController` 를 보고 맞출 것 — 문구가 바뀌면 이 알림은
> **조용히 0건이 된다**(사라지는 게 아니라 영영 안 울린다). 그래서 아래 3번이 더 강력하다.

### 3. 429 급증 (nginx rate limit 발동)

**선행 조건: 아래 "nginx 로그 수집"이 먼저 돼야 한다.** `{job="nginx"}` 이 0건이면 이 규칙도 무의미하다.

| 항목 | 값 |
|---|---|
| Query (Loki) | `sum(count_over_time({job="nginx"} \|= " 429 " [5m]))` |
| Condition | `IS ABOVE 100` |
| Evaluate every | `5m` / for `5m` |

임계값은 **평소 트래픽을 먼저 보고 정할 것.** 처음엔 넓게 잡았다가
며칠간 실측치를 본 뒤 조이는 게 맞다 — 오탐이 잦은 알림은 결국 아무도 안 보게 된다.

---

## Promtail 설정

```yaml
# ~/promtail-config.yml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: reserve
    static_configs:
      - targets:
          - localhost
        labels:
          job: reserve
          __path__: /var/log/reserve/*.log
```

> 실제 파일은 레포의 `promtail-config.yml`이 최신이다. **compose가 서버의 `~/promtail-config.yml`을
> 마운트하므로 레포만 고치면 반영되지 않는다** — `scp promtail-config.yml ubuntu@서버:~/` 후
> `docker restart promtail`.

### nginx 로그 수집 (선행 작업 필요)

`{job="nginx"}`로 429·404·스캐닝을 보려면 **서버에서 두 가지가 먼저 돼야 한다.**

1. **nginx가 로그를 진짜 파일로 남기게 한다.** 공식 nginx 이미지는
   `/var/log/nginx/access.log`를 `/dev/stdout`으로 심볼릭 링크해 둬서 **파일이 존재하지 않는다.**
   호스트 디렉토리를 컨테이너에 마운트해야 한다.

   ```bash
   sudo mkdir -p /var/log/nginx-host
   # nginxserver 재생성 시 -v /var/log/nginx-host:/var/log/nginx 추가
   # (컨테이너 안의 심볼릭 링크가 마운트로 덮이면서 실제 파일이 생긴다)
   ```

2. promtail에 그 경로를 read-only로 마운트한다 → `docker-compose-monitoring.yml`에 이미 반영됨.

확인: Grafana에서 `{job="nginx"}`가 0건이면 1번이 안 된 것이다.

```logql
{job="nginx"} |= " 429 "     # rate limit에 걸린 요청
{job="nginx"} |= " 404 "     # 스캐너가 긁는 경로
```

---

## Logback

`backend/src/main/resources/logback-spring.xml`에서 관리합니다.

- 운영 환경: `/var/log/reserve/app.log`에 파일 출력
- 30일 경과 로그 자동 삭제 (rotation)
- 로컬 환경: 콘솔 출력만

> 컨테이너가 non-root(`appuser`)로 실행되므로 서버에서 `/var/log/reserve` 디렉토리 소유권이 필요합니다.
> ```bash
> sudo mkdir -p /var/log/reserve
> sudo chown -R 1000:1000 /var/log/reserve
> ```

---

## Sentry

런타임 에러를 실시간으로 수집합니다. 운영 환경에서만 활성화됩니다.

- **백엔드:** `SENTRY_DSN` 환경변수로 주입 (GitHub Secrets → docker-compose)
- **프론트:** `VITE_SENTRY_DSN` 환경변수로 주입 (GitHub Secrets → `.env.production`)

---

## UptimeRobot

5분 간격으로 `https://reserve.it.kr` 헬스체크를 수행합니다. 다운 시 이메일 알림이 발송됩니다.

---

## SonarCloud

- **프로젝트:** [sonarcloud.io → hanjeun/reserve](https://sonarcloud.io/project/overview?id=hanjeun_reserve)
- **검사 항목:** 보안 취약점, 코드 중복, 유지보수성
- **연동 방식:** SonarCloud **Automatic Analysis** — SonarCloud가 저장소를 직접 보고 분석한다.
  워크플로에 sonar 스텝이 없고 `sonar-project.properties`도 없다.
  즉 **CI가 실패해도 Sonar는 돌고, Sonar가 실패해도 CI는 막히지 않는다.**
  Quality Gate를 PR 머지 조건으로 쓰려면 GitHub 브랜치 보호의 필수 체크에 별도로 추가해야 한다.
