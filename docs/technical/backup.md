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
> 2026-09-26 v2.6.1 배포 뒤 `reserve-backup`만 v2.6.1 태그 버전(SHA-256 `f2434537…8845`, AWS 값 export 수정 포함)으로
> 교체하고 수동 실행으로 업로드를 확인했다(28 tables, 11 KiB). `reserve-restore`는 바뀐 게 없어 v2.6.0 버전 그대로다.
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

키는 **화면·명령 기록에 남지 않게** 입력받는다. DB 비밀번호는 **실행 중인 앱 컨테이너**(blue/green)에서 읽는다 —
앱은 배포 때 GitHub Secret `DB_PASSWORD`를 받으므로 그게 현재 값이다. MySQL 컨테이너의 `MYSQL_ROOT_PASSWORD`는
컨테이너를 처음 만들 때의 값이라, 비밀번호를 한 번이라도 바꾼 뒤에는 틀린 값이다(7장).
서버에는 aws CLI가 없어 업로드는 스크립트의 docker 폴백(`amazon/aws-cli`)이 한다.

```bash
read -rp 'AWS_ACCESS_KEY_ID: ' AK; read -rsp 'AWS_SECRET_ACCESS_KEY: ' SK; echo
C=$(sudo docker ps --format '{{.Names}}' | grep -E '^(blue|green)$'); DBPW="$(sudo docker exec "$C" printenv DB_PASSWORD)"; echo "lengths: ${#DBPW} ${#AK} ${#SK}"   # 셋 다 0이 아니어야 한다
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

DB 비밀번호의 기준은 root 전용 설정 파일 `/etc/reserve-backup.env`다. 운영자 셸로 한 번 읽어 와서 쓰고, 끝나면 지운다.
MySQL 컨테이너의 `MYSQL_ROOT_PASSWORD`는 2026-09-25 교체 전의 옛 값이라 쓰면 안 된다(7장).

```bash
# DB 접속 준비 — 비밀번호의 기준은 /etc/reserve-backup.env (7장)
export DB_PASSWORD="$(sudo sh -c '. /etc/reserve-backup.env; printf %s "$DB_PASSWORD"')"; echo "length: ${#DB_PASSWORD}"

# 검증 → 별도 DB로 복원 (운영 DB는 건드리지 않는다)
F=$(ls -t /var/backups/reserve/reserve-*.sql.gz | head -1); echo "$F"
sudo reserve-restore --dry-run "$F"
sudo reserve-restore --target reserve_restore_test "$F"    # "restored tables" 가 덤프 테이블 수와 같아야 한다

# 전체 테이블 행 수 대조 — 백업 시각 이후 바뀐 테이블만 DIFF가 날 수 있다
sudo docker exec -e MYSQL_PWD="$DB_PASSWORD" mysql sh -c 'for t in $(mysql -uroot -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema=\"reserve\""); do a=$(mysql -uroot -N -e "SELECT COUNT(*) FROM reserve.$t"); b=$(mysql -uroot -N -e "SELECT COUNT(*) FROM reserve_restore_test.$t"); [ "$a" = "$b" ] && echo "same $t $a" || echo "DIFF $t prod=$a restored=$b"; done'

# 정리 — 이름이 reserve_restore_test 인지 확인하고 실행한다
sudo docker exec -e MYSQL_PWD="$DB_PASSWORD" mysql mysql -uroot -e "DROP DATABASE reserve_restore_test; SHOW DATABASES;"
unset DB_PASSWORD
```

훈련 결과는 이 문서 맨 아래 이력에 한 줄 남긴다.

---

## 4. 서버 재구축 시 MySQL 되살리기

레포의 `docker-compose-mysql.yml`이 그 수단이다.

> ⚠️ **기존 서버에 그대로 `up -d` 하지 말 것.** 볼륨 이름이 실제와 다르면
> 데이터가 없는 새 볼륨으로 떠서 "DB가 텅 빈" 상태가 된다.
> 파일 상단 주석의 `docker inspect` 대조 절차를 먼저 수행한다.

> **지금 운영 MySQL 컨테이너(2026-09-25 확인)** 는 compose가 아니라 `docker run`으로 만든 것이다.
> 상태 검사(healthcheck)가 없고, 데이터는 볼륨 `mysql-data`(`/var/lib/mysql`)에 있다.
> 컨테이너 설정의 `MYSQL_ROOT_PASSWORD`는 처음 만들 때 값이라 지금 비밀번호와 다르다 — 비밀번호를 읽는 데 쓰지 말 것.
> 컨테이너를 다시 만들 일이 생기면 그때 현재 비밀번호를 `DB_PASSWORD`로 넘긴다
> (데이터가 이미 있으면 MySQL은 `MYSQL_ROOT_PASSWORD`를 무시하므로 설정 값만 맞춰진다).

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

## 7. DB root 비밀번호 무중단 교체

2026-09-25에 4자리였던 root 비밀번호를 32자(영문·숫자)로 바꾸며 쓴 절차다. **서비스는 한순간도 멈추지 않았다.**
MySQL 8의 이중 비밀번호(`RETAIN CURRENT PASSWORD`)로 옛 값과 새 값이 잠시 둘 다 통하게 해 두고,
쓰는 곳을 하나씩 옮긴 뒤 옛 값을 폐기한다.

### 비밀번호를 쓰는 곳

| 쓰는 곳 | 계정 | 값이 들어가는 경로 |
|---|---|---|
| 앱(blue/green) | root (`DB_USERNAME` 미설정 → 기본값 root) | GitHub Secret `DB_PASSWORD` → 배포 때 컨테이너 환경 변수 |
| 백업·복원 스크립트 | root | `/etc/reserve-backup.env` |
| 개발 PC IntelliJ `reserve-prod` 데이터 소스 | root | IntelliJ 저장값(SSH 터널) |
| MySQL 컨테이너 설정 `MYSQL_ROOT_PASSWORD` | — | 처음 만들 때 값. 교체 뒤에는 틀린 값이라 쓰지 않는다 |

### 원칙

- 새 비밀번호는 **영문·숫자만** 쓴다. `$`·`!`·따옴표는 compose·YAML·셸에서 다르게 해석된다(`docs/rules/git-workflow.md`).
- 값은 채팅·로그·명령 인자·문서에 남기지 않는다. 서버에서는 `read -rsp`로 받고, `docker exec`에는 환경 변수 **이름만** 넘긴다.
- GitHub Secret은 다시 읽을 수 없으므로, 넣기 전에 **SHA-256 지문(앞 12자)** 으로 서버 값과 같은지 대조한다.
  지문은 공유해도 비밀번호를 알아낼 수 없다.
- 터미널에서 비밀번호를 복사할 때는 **더블클릭**으로 선택한다(영문·숫자 한 단어라 정확히 잡힌다).
  복사한 뒤 지문 대조가 끝날 때까지 다른 것을 복사하지 않는다 — 2026-09-25에도 그 사이 클립보드가 바뀌어 한 번 멈췄다.

### 순서

```bash
# 1. 서버 — 새 비밀번호를 두 root 계정에 추가한다(옛 비밀번호는 유지). 이 SSH 창은 끝날 때까지 닫지 않는다.
read -rsp 'NEW DB PASSWORD: ' NEWPW; echo; echo "length: ${#NEWPW}"
export NEWPW MYSQL_PWD="$(sudo sh -c '. /etc/reserve-backup.env; printf %s "$DB_PASSWORD"')"   # MYSQL_PWD = 지금(옛) 비밀번호
sudo --preserve-env=NEWPW,MYSQL_PWD docker exec -e NEWPW -e MYSQL_PWD mysql sh -c 'mysql -uroot -e "ALTER USER \"root\"@\"%\" IDENTIFIED BY \"$NEWPW\" RETAIN CURRENT PASSWORD; ALTER USER \"root\"@\"localhost\" IDENTIFIED BY \"$NEWPW\" RETAIN CURRENT PASSWORD;"'
sudo --preserve-env=NEWPW,MYSQL_PWD docker exec -e NEWPW -e MYSQL_PWD mysql sh -c 'mysql -uroot -N -e "SELECT \"old ok\""; MYSQL_PWD="$NEWPW" mysql -uroot -N -e "SELECT \"new ok\""'
printf '%s' "$NEWPW" | sha256sum | cut -c1-12   # 지문
```

```powershell
# 2. 개발 PC — 클립보드 값의 지문이 서버 지문과 같을 때만 GitHub Secret 을 바꾼다
$cb = (Get-Clipboard | Out-String).Trim(); $h = [Security.Cryptography.SHA256]::Create()
(($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($cb)) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0,12)
$cb | gh secret set DB_PASSWORD -R hanjeun/reserve; Remove-Variable cb

# 3. 재배포 — main 의 최신 CICD 실행을 다시 실행한다(빌드·배포 세 단계뿐, 태그·릴리즈 없음)
gh run list -R hanjeun/reserve --branch main --workflow CICD.yml --limit 1
gh run rerun <run id> -R hanjeun/reserve
```

```bash
# 3-확인 — 새 앱이 새 비밀번호로 떴는지 (지문이 같고, Access denied 가 없고, 200)
C=$(sudo docker ps --format '{{.Names}}' | grep -E '^(blue|green)$'); echo "active: $C"
sudo docker exec "$C" sh -c 'printf %s "$DB_PASSWORD"' | sha256sum | cut -c1-12
sudo docker logs --since 20m "$C" 2>&1 | grep -iE "Access denied|Started ReserveApplication" | tail -3
curl -s -o /dev/null -w '%{http_code}\n' 'https://reserve.it.kr/api/stores?size=1'

# 4. 백업 설정 — 값을 바꾸고 지문·권한 확인 후 백업을 한 번 돌린다
sudo --preserve-env=NEWPW sh -c 'sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$NEWPW/" /etc/reserve-backup.env'
sudo sh -c '. /etc/reserve-backup.env; printf %s "$DB_PASSWORD"' | sha256sum | cut -c1-12; sudo stat -c '%a %U' /etc/reserve-backup.env
sudo /usr/local/bin/reserve-backup

# 5. IntelliJ — Database 창 → reserve-prod → 데이터 소스 속성 → 비밀번호 교체 → 연결 테스트 → 확인

# 6. 옛 비밀번호 폐기 — 2~5 가 전부 확인된 뒤에만
sudo --preserve-env=NEWPW docker exec -e NEWPW mysql sh -c 'MYSQL_PWD="$NEWPW" mysql -uroot -e "ALTER USER \"root\"@\"%\" DISCARD OLD PASSWORD; ALTER USER \"root\"@\"localhost\" DISCARD OLD PASSWORD;"'
sudo --preserve-env=NEWPW,MYSQL_PWD docker exec -e NEWPW -e MYSQL_PWD mysql sh -c 'MYSQL_PWD="$NEWPW" mysql -uroot -N -e "SELECT \"new ok\""; mysql -uroot -N -e "SELECT \"old still ok\"" 2>&1 | head -1'   # old 는 Access denied 여야 한다
curl -s -o /dev/null -w '%{http_code}\n' 'https://reserve.it.kr/api/stores?size=1'
unset NEWPW MYSQL_PWD
```

### 주의

- **1단계 뒤에 `RETAIN CURRENT PASSWORD`를 다시 쓰지 말 것.** 그러면 새 값이 보조로 밀리고 옛 값(앱이 쓰는 값)이 사라져
  앱이 끊긴다. 새 값을 잃어버렸다면 `RETAIN` 없이 `IDENTIFIED BY`만 다시 실행한다 — 보조(옛) 비밀번호는 그대로 남는다.
- 폐기(6단계)는 2~5단계를 모두 확인한 뒤에만 한다. 그 전까지는 무엇이 잘못돼도 옛 값으로 계속 돈다.
- 앱 전용 DB 계정(`reserve.*` 권한만)을 따로 두면 root 비밀번호를 앱과 분리할 수 있다. `application-prod.yml`이
  `DB_USERNAME`을 이미 받으므로 compose·CICD에 값만 추가하면 된다(미적용).

### 교체 이력

| 날짜 | 내용 | 메모 |
|---|---|---|
| 2026-09-25 | 4자리 → 32자 영문·숫자 | GitHub Secret 교체 후 CICD `36096322397` 재실행(green), 백업 설정·IntelliJ 교체, 옛 값 폐기. 무중단 |

---

## 복원 훈련 이력

| 날짜 | 대상 백업 | 결과 | 메모 |
|---|---|---|---|
| 2026-09-25 | `reserve-20260925-095532.sql.gz` (9.8 KiB) | 통과 — 26/26 테이블 복원, 26개 테이블 행 수 운영과 일치 | 별도 DB `reserve_restore_test`로 복원 후 삭제. 다음 훈련 2026-12 |
