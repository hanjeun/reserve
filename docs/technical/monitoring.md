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

PR이 `main` 브랜치로 올라올 때마다 자동으로 정적 분석이 실행됩니다.

- **프로젝트:** [sonarcloud.io → hanjeun/reserve](https://sonarcloud.io/project/overview?id=hanjeun_reserve)
- **검사 항목:** 보안 취약점, 코드 중복, 유지보수성
- **CI 연동:** `CICD.yml` 내 SonarCloud GitHub Action
