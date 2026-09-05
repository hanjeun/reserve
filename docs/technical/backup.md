# 백업 · 복구 런북

RESERVE의 MySQL 백업 구성과 복원 절차. **결제·예약 데이터가 있는 서비스라 이 문서가 보안 문서보다 우선순위가 높다** —
공격자가 없어도 디스크 장애·조작 실수만으로 터지는 영역이기 때문이다.

| 항목 | 값 |
|---|---|
| 대상 | MySQL 8 컨테이너 `mysql`, DB `reserve` |
| 방식 | `mysqldump --single-transaction` (서비스 중단 없음) |
| 목표 주기 | 매일 03:10 KST (cron) |
| 목표 보관 | 로컬 7일 + S3 (라이프사이클로 30일/90일 관리) |
| 스크립트 | `scripts/backup-mysql.sh`, `scripts/restore-mysql.sh` |
| 목표 로그 | `/var/log/reserve/backup.log` → Promtail → Loki → Grafana |

> **운영 상태 — 2026-09-02 읽기 전용 확인:** 저장소의 스크립트만 존재한다.
> 서버에는 `/usr/local/bin/reserve-backup`·`reserve-restore`, `/etc/reserve-backup.env`, root cron,
> `/var/backups/reserve` 백업 파일, `/var/log/reserve/backup.log`가 모두 없다. 복원 훈련도 미실시다.
> 따라서 위 주기·보관·로그는 **현재 상태가 아니라 설치 후 목표 상태**다.

---

## 0. 먼저 확인할 것 — Lightsail 자동 스냅샷

애플리케이션 레벨 백업(mysqldump)과 인스턴스 스냅샷은 **서로 대체재가 아니다.**

| | 스냅샷 | mysqldump |
|---|---|---|
| 복구 단위 | 인스턴스 통째 | DB·테이블 단위 |
| "어제 지운 예약 하나만 살리기" | ❌ | ✅ |
| 서버 자체가 날아갔을 때 | ✅ | 별도 보관 위치 필요(S3) |
| 비용 | 디스크 크기 비례 | 덤프 크기(수십 MB) |

둘 다 켜는 게 맞다. Lightsail 콘솔 → 인스턴스 → Snapshots → **Automatic snapshots 활성화**(보관 7일).
2026-09-02 서버·GitHub 읽기 전용 감사만으로는 활성화 여부를 확인할 수 없었다. AWS 콘솔에서 직접
확인해 증거 시각을 남길 것 — 켜져 있다면 이 문서의 나머지는 "세밀한 복구 수단"을 추가하는 작업이 된다.

---

## 1. 설치 (서버에서 1회)

### 1-1. 스크립트 배치

```bash
# 레포에서 서버로 (또는 git pull 후 서버 경로에서)
sudo cp scripts/backup-mysql.sh  /usr/local/bin/reserve-backup
sudo cp scripts/restore-mysql.sh /usr/local/bin/reserve-restore
sudo chmod +x /usr/local/bin/reserve-backup /usr/local/bin/reserve-restore

sudo mkdir -p /var/backups/reserve
sudo chown ubuntu:ubuntu /var/backups/reserve
```

### 1-2. 설정 파일

```bash
sudo tee /etc/reserve-backup.env >/dev/null <<'EOF'
DB_PASSWORD=<운영 DB 비밀번호>
BACKUP_S3_BUCKET=reserve-it-kr-backup
BACKUP_S3_PREFIX=mysql
LOCAL_RETENTION_DAYS=7

# 서버에 aws CLI가 없어 docker 폴백을 쓸 때만 필요
AWS_ACCESS_KEY_ID=<백업 전용 키>
AWS_SECRET_ACCESS_KEY=<백업 전용 시크릿>
AWS_DEFAULT_REGION=ap-northeast-2
EOF

sudo chmod 600 /etc/reserve-backup.env
sudo chown root:root /etc/reserve-backup.env
```

> ⚠️ **이미지용 `reserve-s3-user` 키를 그대로 쓰지 말 것.** 그 사용자는 지금 `AmazonS3FullAccess`라
> 키가 새면 이미지 버킷과 백업 버킷이 **동시에** 털린다. 백업 버킷에 대한 별도 사용자를 만든다.

### 1-3. 백업 전용 IAM 정책

백업 사용자에게는 **쓰기만** 준다. 읽기·삭제를 주지 않으면, 그 키가 유출돼도 공격자가
백업을 지우거나 내려받을 수 없다(랜섬웨어가 백업부터 지우는 걸 막는 게 핵심이다).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PutBackupObjectsOnly",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::reserve-it-kr-backup/mysql/*"
    }
  ]
}
```

복원할 때 필요한 `s3:GetObject`/`ListBucket`은 **그때 관리자 자격증명으로** 한다.
서버에 상시로 두지 않는다.

버킷 설정:
- **버전 관리(Versioning) 켜기** — 실수로 덮어써도 이전 객체가 남는다
- **퍼블릭 액세스 차단** 전부 켜기
- 라이프사이클: 30일 후 Glacier Instant Retrieval, 90일 후 만료 (비용 관리)

### 1-4. cron 등록

```bash
sudo crontab -e
```

```cron
# RESERVE MySQL 백업 — 매일 03:10 KST
# 운영 서버는 UTC이므로 전날 18:10 UTC에 실행한다.
10 18 * * * /usr/local/bin/reserve-backup >/dev/null 2>&1
```

> 2026-09-02 확인 당시 서버와 JVM은 UTC였다. `TrashCleanupScheduler`의 `03:00`도 JVM 기준
> 03:00 UTC(12:00 KST)이므로 백업과 겹치지 않는다. 타임존 정책을 바꾸면 cron도 함께 재검토한다.

### 1-5. 첫 실행 확인

```bash
sudo /usr/local/bin/reserve-backup
tail -20 /var/log/reserve/backup.log
ls -lh /var/backups/reserve/
```

로그에 `verified: ... , NN tables` 와 `upload ok` 가 찍혀야 정상이다.

---

## 2. 복원

### 2-1. 백업 목록 확인

```bash
reserve-restore --list
```

### 2-2. 검증만 (DB를 건드리지 않음)

```bash
reserve-restore --dry-run /var/backups/reserve/reserve-20260731-031000.sql.gz
```

### 2-3. 실제 복원 (운영)

```bash
# 1. 쓰기 차단 — 복원 중 들어온 데이터는 어차피 덮어써진다
sudo docker stop blue green 2>/dev/null || true

# 2. 지금 상태를 먼저 백업 (복원 자체가 잘못됐을 때의 되돌릴 지점)
sudo /usr/local/bin/reserve-backup

# 3. 복원 — 'RESTORE reserve' 를 입력해야 진행된다
reserve-restore /var/backups/reserve/reserve-20260731-031000.sql.gz

# 4. 앱 재기동 (nginx가 가리키는 쪽으로)
sudo docker exec nginxserver cat /etc/nginx/conf.d/service-env.inc   # blue/green 확인
sudo -E docker compose -f /home/ubuntu/docker-compose-blue.yml up -d

# 5. 확인
curl -s localhost:8080/actuator/health
```

### 2-4. S3에서 직접 복원

```bash
reserve-restore s3://reserve-it-kr-backup/mysql/reserve-20260731-031000.sql.gz
```

---

## 3. 복원 훈련 (분기 1회)

**한 번도 복원해보지 않은 백업은 대개 필요할 때 안 된다.** 운영 DB를 건드리지 않고 확인한다.

```bash
# 별도 DB로 복원
reserve-restore --target reserve_restore_test \
    /var/backups/reserve/$(ls -t /var/backups/reserve | head -1)

# 행 수 대조 — 운영과 크게 다르면 백업 파이프라인을 의심한다
docker exec -e MYSQL_PWD="$DB_PASSWORD" mysql mysql -u root -N -B -e "
  SELECT 'member', COUNT(*) FROM reserve.member
  UNION ALL SELECT 'member_restored', COUNT(*) FROM reserve_restore_test.member
  UNION ALL SELECT 'reservation', COUNT(*) FROM reserve.reservation
  UNION ALL SELECT 'reservation_restored', COUNT(*) FROM reserve_restore_test.reservation;"

# 정리
docker exec -e MYSQL_PWD="$DB_PASSWORD" mysql mysql -u root \
    -e "DROP DATABASE reserve_restore_test;"
```

훈련 결과는 이 문서 맨 아래 이력에 한 줄 남긴다.

---

## 4. 서버 재구축 시 MySQL 되살리기

레포의 `docker-compose-mysql.yml`이 그 수단이다.

> ⚠️ **기존 서버에 그대로 `up -d` 하지 말 것.** 볼륨 이름이 실제와 다르면
> 데이터가 없는 새 볼륨으로 떠서 "DB가 텅 빈" 상태가 된다.
> 파일 상단 주석의 `docker inspect` 대조 절차를 먼저 수행한다.

신규 서버라면:

```bash
docker network create app-network            # 없다면
export DB_PASSWORD=<운영 DB 비밀번호>
sudo -E docker compose -f docker-compose-mysql.yml up -d

# 최신 백업으로 복원
reserve-restore s3://reserve-it-kr-backup/mysql/<최신파일>
```

---

## 5. 모니터링

백업 로그가 `/var/log/reserve/backup.log`에 쌓이고 Promtail이 그 디렉토리를 수집하므로
Grafana에서 그대로 보인다.

```logql
{job="reserve"} |= "[backup]"
{job="reserve"} |= "[backup] ERROR"
```

알림 규칙(권장): **"최근 26시간 동안 `[backup] === backup done` 이 0건"** 이면 알림.
실패 알림보다 이쪽이 낫다 — 스크립트가 아예 실행되지 않은 경우(cron 죽음, 디스크 풀)까지 잡히기 때문이다.

---

## 6. 알려진 한계

- **RPO 24시간.** 마지막 백업 이후의 데이터는 복구되지 않는다. 결제 건이 걸리면
  PortOne 관리자 콘솔의 거래 내역이 사실상의 2차 원장이 되므로 대조에 쓸 수 있다.
- **바이너리 로그 기반 시점 복구(PITR)는 구성돼 있지 않다.** 서버 1대·1인 운영 규모에서
  binlog 관리 비용이 이득보다 크다고 판단했다. 필요해지면 `--log-bin` + binlog S3 동기화로 확장한다.
- `--single-transaction`은 **InnoDB 전제**다. MyISAM 테이블이 섞이면 그 테이블은 일관성이 보장되지 않는다.
  확인: `SELECT table_name, engine FROM information_schema.tables WHERE table_schema='reserve' AND engine <> 'InnoDB';`

---

## 복원 훈련 이력

| 날짜 | 대상 백업 | 결과 | 메모 |
|---|---|---|---|
| _(미실시)_ | | | 첫 훈련 필요 |
