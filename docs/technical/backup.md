# 백업 · 복구 런북

RESERVE의 MySQL 백업 구성과 복원 절차. **결제·예약 데이터가 있는 서비스라 이 문서가 보안 문서보다 우선순위가 높다** —
공격자가 없어도 디스크 장애·조작 실수만으로 터지는 영역이기 때문이다.

| 항목 | 값 |
|---|---|
| 대상 | MySQL 8 컨테이너 `mysql`, DB `reserve` |
| 방식 | `mysqldump --single-transaction` (서비스 중단 없음) |
| 주기 | 매일 03:10 KST (root cron, 18:10 UTC) |
| 보관 | 로컬 7일 + S3 `reserve-it-kr-backup/mysql/` 90일(Standard, 옛 버전은 7일 뒤 삭제) |
| 스크립트 | `scripts/backup-mysql.sh`, `scripts/restore-mysql.sh` |
| 목표 로그 | `/var/log/reserve/backup.log` → Promtail → Loki → Grafana |

> **운영 상태 — 2026-09-25 적용 완료:** 서버에 `/usr/local/bin/reserve-backup`·`reserve-restore`(v2.6.0 태그 버전,
> SHA-256 대조), `/etc/reserve-backup.env`(600 root), root cron, `/var/backups/reserve`를 설치했다.
> 첫 백업 `reserve-20260925-095532.sql.gz`(26 tables, 9.8 KiB)가 S3에 올라갔고, 별도 DB 복원 훈련을 통과했다(맨 아래 이력).
> 로그 → Grafana 연결과 실패 알림은 아직 목표 상태다(5장).

---

## 0. 먼저 확인할 것 — Lightsail 자동 스냅샷

애플리케이션 레벨 백업(mysqldump)과 인스턴스 스냅샷은 **서로 대체재가 아니다.**

| | 스냅샷 | mysqldump |
|---|---|---|
| 복구 단위 | 인스턴스 통째 | DB·테이블 단위 |
| "어제 지운 예약 하나만 살리기" | ❌ | ✅ |
| 서버 자체가 날아갔을 때 | ✅ | 별도 보관 위치 필요(S3) |
| 비용 | 디스크 크기 비례 | 덤프 크기(수십 MB) |

**2026-09-25 결정: 자동 스냅샷은 켜지 않는다.** 확인 당시 `reserve-server`(`small_3_0`)의 AutoSnapshot은 꺼져 있었다.
코드·설정은 GitHub과 개발 PC에, 비밀값은 GitHub Secrets에 있어 서버 자체는 다시 만들 수 있고,
**다시 만들 수 없는 건 DB뿐**이라 mysqldump + S3로 충분하다고 판단했다(스냅샷 비용을 쓰지 않는다).
서버를 새로 만드는 절차는 4장이다.

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

서버에 레포가 없으면 **배포된 태그 버전**을 받아, 같은 태그의 파일 해시와 대조한 뒤 설치한다.

```bash
TAG=v2.6.0
curl -fsSL -o /tmp/reserve-backup  https://raw.githubusercontent.com/hanjeun/reserve/$TAG/scripts/backup-mysql.sh
curl -fsSL -o /tmp/reserve-restore https://raw.githubusercontent.com/hanjeun/reserve/$TAG/scripts/restore-mysql.sh
sha256sum /tmp/reserve-backup /tmp/reserve-restore   # 레포의 같은 태그 파일 해시와 같아야 한다
sudo install -m 0755 /tmp/reserve-backup /tmp/reserve-restore /usr/local/bin/
```

### 1-2. 설정 파일

키는 **화면·명령 기록에 남지 않게** 입력받고, DB 비밀번호는 MySQL 컨테이너 환경 변수에서 바로 읽는다.
서버에는 aws CLI가 없어 업로드는 스크립트의 docker 폴백(`amazon/aws-cli`)이 한다.

```bash
read -rp 'AWS_ACCESS_KEY_ID: ' AK; read -rsp 'AWS_SECRET_ACCESS_KEY: ' SK; echo
DBPW="$(sudo docker exec mysql printenv MYSQL_ROOT_PASSWORD)"; echo "lengths: ${#DBPW} ${#AK} ${#SK}"   # 셋 다 0이 아니어야 한다
sudo install -m 600 -o root -g root /dev/null /etc/reserve-backup.env
printf 'DB_PASSWORD=%q\nBACKUP_S3_BUCKET=reserve-it-kr-backup\nBACKUP_S3_PREFIX=mysql\nLOCAL_RETENTION_DAYS=7\nAWS_ACCESS_KEY_ID=%q\nAWS_SECRET_ACCESS_KEY=%q\nAWS_DEFAULT_REGION=ap-northeast-2\n' \
  "$DBPW" "$AK" "$SK" | sudo tee /etc/reserve-backup.env >/dev/null
unset AK SK DBPW
sudo stat -c '%a %U %n' /etc/reserve-backup.env   # 600 root
```

> 2026-09-25 설치 때는 스크립트가 AWS 값을 내보내지 않아 설정 파일의 AWS 줄 앞에 `export`를 붙여 우회했다.
> 지금 스크립트는 스스로 내보내므로 `export`는 없어도 되고, 있어도 동작한다(운영 파일은 그대로 둔다).

> ⚠️ **이미지용 `reserve-s3-user` 키를 백업에 쓰지 말 것.** 백업 버킷은 별도 사용자(`reserve-backup-uploader`)만 쓴다.

### 1-3. 백업 전용 IAM 정책

사용자 `reserve-backup-uploader`, 인라인 정책 `reserve-backup-put-only`(2026-09-25 생성).
액세스 키에는 설명 태그로 "어디에 넣었나 · 용도"를 남긴다(`lightsail mysql backup upload only - /etc/reserve-backup.env`).
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

버킷 설정(`reserve-it-kr-backup`, 서울, 2026-09-25 CloudShell로 생성):
- **퍼블릭 액세스 차단** 전부 켜기
- **기본 암호화** SSE-S3(AES256) — 스크립트도 업로드 때 `--sse AES256`을 붙인다
- **버전 관리(Versioning) 켜기** — 실수로 덮어써도 이전 객체가 남는다
- 라이프사이클: **Standard로 90일 보관 후 만료**, 버전 관리로 남는 옛 버전은 7일 뒤 삭제, 끊긴 멀티파트 업로드는 1일 뒤 정리.
  Glacier 계열은 쓰지 않는다 — 최소 보관 기간(90일) 요금이 붙고, 덤프가 작아 절약액이 한 달 몇십 원 수준인데 복원만 느려진다.
  같은 접두(`mysql/`)에 만료 규칙을 두 개 두면 겹친다며 거부될 수 있어 하나로 합쳤다.

```bash
aws s3api put-bucket-lifecycle-configuration --bucket reserve-it-kr-backup --lifecycle-configuration '{"Rules":[{"ID":"mysql-90d","Filter":{"Prefix":"mysql/"},"Status":"Enabled","Expiration":{"Days":90},"NoncurrentVersionExpiration":{"NoncurrentDays":7},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}'
```

**앱 사용자 권한도 좁혔다(2026-09-25).** 이미지용 `reserve-s3-user`는 `AmazonS3FullAccess`라 백업 버킷까지 읽고 지울 수 있었다.
앱 코드(`FileStorageService`)가 S3에 하는 일은 올리기(PutObject)·서명 URL 보기(GetObject)·지우기(DeleteObject)뿐이라,
인라인 정책 `reserve-app-images-rw`로 `reserve-it-kr-bucket/*`의 이 세 동작만 허용하고 `AmazonS3FullAccess`를 뗐다.
IAM 시뮬레이터에서 이미지 버킷은 `allowed`, 백업 버킷은 `implicitDeny`였고, 운영에서 프로필 사진 업로드도 정상이었다.
(시뮬레이터는 자원을 하나씩 넣어야 한다 — 여러 개를 한 번에 넣으면 맨 위에 일반 경우의 요약만 나와 거부처럼 보인다.)

### 1-4. cron 등록

편집기 대신 아래 한 줄로 등록한다. 여러 번 실행해도 줄이 중복되지 않는다.

```bash
( sudo crontab -l 2>/dev/null | grep -v '/usr/local/bin/reserve-backup'; echo '10 18 * * * /usr/local/bin/reserve-backup >/dev/null 2>&1' ) | sudo crontab -
sudo crontab -l | grep reserve-backup; date   # 서버는 UTC — 18:10 UTC = 03:10 KST
```

> 2026-09-02 확인 당시 서버와 JVM은 UTC였다. `TrashCleanupScheduler`의 `03:00`도 JVM 기준
> 03:00 UTC(12:00 KST)이므로 백업과 겹치지 않는다. 타임존 정책을 바꾸면 cron도 함께 재검토한다.

### 1-5. 첫 실행 확인

```bash
sudo /usr/local/bin/reserve-backup
tail -20 /var/log/reserve/backup.log
ls -lh /var/backups/reserve/
```

로그에 `verified: ... , NN tables` 와 `upload ok` 가 찍혀야 정상이다. 처음 한 번은 `amazon/aws-cli` 이미지를 받느라 10~20초 더 걸린다.
S3 쪽은 CloudShell에서 `aws s3 ls s3://reserve-it-kr-backup/mysql/ --human-readable`로 확인한다(서버 키는 목록 권한이 없다).

---

## 2. 복원

### 2-1. 백업 목록 확인

```bash
sudo reserve-restore --list   # 설정 파일이 root 전용이라 sudo가 필요하다. S3 목록은 서버에 aws가 없어 "(unavailable)"로 나온다
```

### 2-2. 검증만 (DB를 건드리지 않음)

```bash
sudo reserve-restore --dry-run /var/backups/reserve/reserve-20260731-031000.sql.gz
```

### 2-3. 실제 복원 (운영)

```bash
# 1. 쓰기 차단 — 복원 중 들어온 데이터는 어차피 덮어써진다
sudo docker stop blue green 2>/dev/null || true

# 2. 지금 상태를 먼저 백업 (복원 자체가 잘못됐을 때의 되돌릴 지점)
sudo /usr/local/bin/reserve-backup

# 3. 복원 — 'RESTORE reserve' 를 입력해야 진행된다
sudo reserve-restore /var/backups/reserve/reserve-20260731-031000.sql.gz

# 4. 앱 재기동 (nginx가 가리키는 쪽으로)
sudo docker exec nginxserver cat /etc/nginx/conf.d/service-env.inc   # blue/green 확인
sudo -E docker compose -f /home/ubuntu/docker-compose-blue.yml up -d

# 5. 확인
curl -s localhost:8080/actuator/health
```

### 2-4. S3에서 복원

서버에는 aws CLI도 읽기 권한도 없다(백업 키는 올리기 전용). **CloudShell(관리자 권한)에서 10분짜리 임시 다운로드 주소를 만들고**,
서버는 그 주소로 파일만 받는다. 서버에 관리자 키를 두지 않기 위해서다.

```bash
# CloudShell
aws s3 ls s3://reserve-it-kr-backup/mysql/ --human-readable
aws s3 presign s3://reserve-it-kr-backup/mysql/reserve-20260731-031000.sql.gz --expires-in 600

# 서버 — 위에서 나온 주소를 따옴표로 감싸 붙여 넣는다
curl -fsSL -o /var/backups/reserve/reserve-20260731-031000.sql.gz '<presigned URL>'
sudo reserve-restore --dry-run /var/backups/reserve/reserve-20260731-031000.sql.gz
```

---

## 3. 복원 훈련 (분기 1회)

**한 번도 복원해보지 않은 백업은 대개 필요할 때 안 된다.** 운영 DB를 건드리지 않고 확인한다.

DB 비밀번호는 root 전용 설정 파일에 있어 운영자 셸에는 없다. 비교·정리는 MySQL 컨테이너 안의 환경 변수를 쓴다.

```bash
# 검증 → 별도 DB로 복원 (운영 DB는 건드리지 않는다)
F=$(ls -t /var/backups/reserve/reserve-*.sql.gz | head -1); echo "$F"
sudo reserve-restore --dry-run "$F"
sudo reserve-restore --target reserve_restore_test "$F"    # "restored tables" 가 덤프 테이블 수와 같아야 한다

# 전체 테이블 행 수 대조 — 백업 시각 이후 바뀐 테이블만 DIFF가 날 수 있다
sudo docker exec mysql sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; for t in $(mysql -uroot -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema=\"reserve\""); do a=$(mysql -uroot -N -e "SELECT COUNT(*) FROM reserve.$t"); b=$(mysql -uroot -N -e "SELECT COUNT(*) FROM reserve_restore_test.$t"); [ "$a" = "$b" ] && echo "same $t $a" || echo "DIFF $t prod=$a restored=$b"; done'

# 정리 — 이름이 reserve_restore_test 인지 확인하고 실행한다
sudo docker exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "DROP DATABASE reserve_restore_test; SHOW DATABASES;"'
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

# 최신 백업으로 복원 — S3에서 받는 방법은 2-4
sudo reserve-restore /var/backups/reserve/<최신파일>
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
| 2026-09-25 | `reserve-20260925-095532.sql.gz` (9.8 KiB) | 통과 — 26/26 테이블 복원, 26개 테이블 행 수 운영과 일치 | 별도 DB `reserve_restore_test`로 복원 후 삭제. 다음 훈련 2026-12 |
