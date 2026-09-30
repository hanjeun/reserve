# 백업 · 복구 런북

RESERVE MySQL의 백업 구성과 복원 절차예요.

| 항목 | 값 |
|---|---|
| 대상 | MySQL 8 컨테이너 `mysql`, DB `reserve` |
| 방식 | `mysqldump --single-transaction` (서비스 중단 없음) |
| 주기 | 매일 03:10 KST (root cron, 18:10 UTC) |
| 보관 | 로컬 7일 + S3 `reserve-it-kr-backup/mysql/` 90일(Standard, 옛 버전은 7일 뒤 삭제) |
| 스크립트 | `scripts/backup-mysql.sh`, `scripts/restore-mysql.sh` |
| 설치 위치 | `/usr/local/bin/reserve-backup`·`reserve-restore`, 설정 `/etc/reserve-backup.env`(600 root), 덤프 `/var/backups/reserve` |
| 로그 | `/var/log/reserve/backup.log` → Promtail → Loki → Grafana |

DB 비밀번호는 `/etc/reserve-backup.env`의 `DB_PASSWORD`를 기준으로 써요.

## 1. 설치 (서버에서 1회)

### 1-1. 스크립트 배치

```bash
# 레포에서 서버로 (또는 git pull 후 서버 경로에서)
sudo cp scripts/backup-mysql.sh  /usr/local/bin/reserve-backup
sudo cp scripts/restore-mysql.sh /usr/local/bin/reserve-restore
sudo chmod +x /usr/local/bin/reserve-backup /usr/local/bin/reserve-restore

sudo install -d -m 700 -o root -g root /var/backups/reserve
```

서버에 레포가 없으면 배포된 태그의 파일을 받아 해시를 대조한 뒤 설치해요. `TAG`는 운영에 배포된 태그로 바꿔요.

```bash
TAG=v2.6.0
curl -fsSL -o /tmp/reserve-backup  https://raw.githubusercontent.com/hanjeun/reserve/$TAG/scripts/backup-mysql.sh
curl -fsSL -o /tmp/reserve-restore https://raw.githubusercontent.com/hanjeun/reserve/$TAG/scripts/restore-mysql.sh
sha256sum /tmp/reserve-backup /tmp/reserve-restore   # 레포의 같은 태그 파일 해시와 같아야 한다
sudo install -m 0755 /tmp/reserve-backup /tmp/reserve-restore /usr/local/bin/
```

### 1-2. 설정 파일

키는 화면에 보이지 않게 입력받고, DB 비밀번호는 실행 중인 앱 컨테이너(blue/green)에서 읽어요. 업로드는 스크립트의 docker 폴백(`amazon/aws-cli`)이 해요.

```bash
read -rp 'AWS_ACCESS_KEY_ID: ' AK; read -rsp 'AWS_SECRET_ACCESS_KEY: ' SK; echo
C=$(sudo docker ps --format '{{.Names}}' | grep -E '^(blue|green)$'); DBPW="$(sudo docker exec "$C" printenv DB_PASSWORD)"; echo "lengths: ${#DBPW} ${#AK} ${#SK}"   # 셋 다 0이 아니어야 한다
sudo install -m 600 -o root -g root /dev/null /etc/reserve-backup.env
printf 'DB_PASSWORD=%q\nBACKUP_S3_BUCKET=reserve-it-kr-backup\nBACKUP_S3_PREFIX=mysql\nLOCAL_RETENTION_DAYS=7\nAWS_ACCESS_KEY_ID=%q\nAWS_SECRET_ACCESS_KEY=%q\nAWS_DEFAULT_REGION=ap-northeast-2\n' \
  "$DBPW" "$AK" "$SK" | sudo tee /etc/reserve-backup.env >/dev/null
unset AK SK DBPW
sudo stat -c '%a %U %n' /etc/reserve-backup.env   # 600 root
```

AWS 키는 백업 전용 사용자 `reserve-backup-uploader`의 키를 써요.

### 1-3. 백업 전용 S3·IAM

버킷은 이미지 버킷과 분리한 `reserve-it-kr-backup`(서울 리전)이에요.

| 설정 | 값 |
|---|---|
| Object Ownership | **Bucket owner enforced** (ACL 사용 안 함) |
| Block Public Access | 네 항목 전부 활성화 |
| Versioning | 활성화 |
| 기본 암호화 | SSE-S3(AES256). 스크립트도 업로드 때 `--sse AES256`을 붙여요 |
| 버킷 정책 | `aws:SecureTransport=false` 요청 거부(TLS 강제), 공개 Allow 없음 |
| 객체명 | `mysql/reserve-YYYYMMDD-HHMMSS.sql.gz` — `If-None-Match: *`로 덮어쓰기 거부 |

라이프사이클은 Standard 90일 보관 후 만료, 옛 버전 7일 뒤 삭제, 끊긴 멀티파트 업로드 1일 뒤 정리예요.

```bash
aws s3api put-bucket-lifecycle-configuration --bucket reserve-it-kr-backup --lifecycle-configuration '{"Rules":[{"ID":"mysql-90d","Filter":{"Prefix":"mysql/"},"Status":"Enabled","Expiration":{"Days":90},"NoncurrentVersionExpiration":{"NoncurrentDays":7},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}'
```

버킷 정책:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": [
      "arn:aws:s3:::reserve-it-kr-backup",
      "arn:aws:s3:::reserve-it-kr-backup/*"
    ],
    "Condition": { "Bool": { "aws:SecureTransport": "false" } }
  }]
}
```

`reserve-backup-uploader`에는 인라인 정책 `reserve-backup-put-only`로 쓰기만 줘요.

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

- 스크립트는 5GB 이하 파일을 `s3api put-object` 한 번으로 올려요
- 복원에 필요한 `s3:GetObject`/`ListBucket`은 관리자 또는 단기 복원 자격증명으로 써요
- 이미지용 `reserve-s3-user`는 인라인 정책 `reserve-app-images-rw`로 `reserve-it-kr-bucket/*`의 PutObject·GetObject·DeleteObject만 가져요

### 1-4. cron 등록

여러 번 실행해도 줄이 중복되지 않아요.

```bash
( sudo crontab -l 2>/dev/null | grep -v '/usr/local/bin/reserve-backup'; echo '10 18 * * * /usr/local/bin/reserve-backup >/dev/null 2>&1' ) | sudo crontab -
sudo crontab -l | grep reserve-backup; date   # 서버는 UTC — 18:10 UTC = 03:10 KST
```

### 1-5. 첫 실행 확인

```bash
sudo /usr/local/bin/reserve-backup
tail -20 /var/log/reserve/backup.log
ls -lh /var/backups/reserve/
```

로그에 `verified: ... , NN tables`와 `upload ok`가 찍히면 정상이에요. S3 쪽은 CloudShell에서 `aws s3 ls s3://reserve-it-kr-backup/mysql/ --human-readable`로 확인해요.

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

운영 복원은 별도 승인 후에만 실행해요. 파일의 생성 시각·테이블 수를 현재 스키마와 대조하고,
`--dry-run`을 통과한 실제 경로로 `RESTORE_FILE`을 바꿔요. 아래 명령은 같은 셸에서 실행해요.
어느 단계든 실패하면 다음 단계나 다른 색상 기동으로 넘어가지 않아요.

```bash
(
  set -euo pipefail
  RESTORE_FILE='/var/backups/reserve/reserve-YYYYMMDD-HHMMSS.sql.gz'
  test -f "$RESTORE_FILE"
  command -v jq >/dev/null
  sudo reserve-restore --dry-run "$RESTORE_FILE"

  # 1. nginx의 현재 대상을 먼저 확인한다. 잘못된 설정이면 쓰기 차단 전에 중단한다.
  SERVICE_ENV_LINE=$(sudo docker exec nginxserver cat /etc/nginx/conf.d/service-env.inc | tr -d '\r\n')
  case "$SERVICE_ENV_LINE" in
    'set $service_url blue;') ACTIVE_COLOR=blue; ACTIVE_PORT=8080 ;;
    'set $service_url green;') ACTIVE_COLOR=green; ACTIVE_PORT=8081 ;;
    *) echo 'Invalid nginx upstream; refusing to restore' >&2; exit 1 ;;
  esac
  sudo docker inspect "$ACTIVE_COLOR" >/dev/null

  # 2. 쓰기를 차단하고 지금 상태를 백업한다(잘못 복원했을 때의 되돌릴 지점).
  sudo docker stop blue green 2>/dev/null || true
  if sudo docker ps --format '{{.Names}}' | grep -Exq 'blue|green'; then
    echo 'An app container is still running; refusing to restore' >&2
    exit 1
  fi
  sudo /usr/local/bin/reserve-backup

  # 3. 복원 — 'RESTORE reserve'를 입력해야 진행된다.
  sudo reserve-restore "$RESTORE_FILE"

  # 4. 기존 활성 컨테이너를 시작한다. 수동 셸의 빈 CI 시크릿으로 재생성하지 않는다.
  sudo docker start "$ACTIVE_COLOR"
  HEALTH_BODY=
  for attempt in {1..12}; do
    HEALTH_BODY=$(curl -fsS --max-time 10 "http://127.0.0.1:${ACTIVE_PORT}/actuator/health" 2>/dev/null) || HEALTH_BODY=
    if printf '%s\n' "$HEALTH_BODY" | jq -e '.status == "UP"' >/dev/null 2>&1; then break; fi
    sleep 5
  done
  printf '%s\n' "$HEALTH_BODY" | jq -e '.status == "UP"' >/dev/null
  API_BODY=$(curl -fsS --max-time 20 --resolve reserve.it.kr:443:127.0.0.1 \
    'https://reserve.it.kr/api/stores?page=0&size=1')
  printf '%s\n' "$API_BODY" | jq -e '.success == true and (.data.content | type == "array")' >/dev/null
)
```

공개 `/actuator/health`의 HTTP 200만으로 백엔드가 정상이라고 판단하지 않아요.
그 경로가 HTML SPA를 반환할 수 있으므로, 활성 포트의 Actuator JSON `status=UP`과
nginx 경유 공개 API JSON을 각각 확인해요. 로컬 덤프 격리 복원 성공도 이 운영 절차의 리허설이나
S3 원본 복원 성공을 뜻하지 않아요.

명령 분기와 중단 조건은 레포 루트에서 `node --test scripts/tests/backup-runbook.test.mjs`로
검사할 수 있어요. 모든 외부 명령을 대체한 모의 검사이므로 앱 중단·백업·DB 복원은 실행하지 않아요.
blue/green 선택, 잘못된 upstream, 남은 쓰기 프로세스, 현재 상태 백업 실패와 HTML 응답 거부를
검사하며, 실제 격리 DB 복원 훈련을 대신하지 않아요.

### 2-4. S3에서 복원

CloudShell(관리자 권한)에서 10분짜리 임시 다운로드 주소를 만들고, 서버는 그 주소로 파일을 받아요.

```bash
# CloudShell
aws s3 ls s3://reserve-it-kr-backup/mysql/ --human-readable
aws s3 presign s3://reserve-it-kr-backup/mysql/reserve-20260731-031000.sql.gz --expires-in 600

# 서버 — 위에서 나온 주소를 따옴표로 감싸 붙여 넣는다
curl -fsSL -o /var/backups/reserve/reserve-20260731-031000.sql.gz '<presigned URL>'
sudo reserve-restore --dry-run /var/backups/reserve/reserve-20260731-031000.sql.gz
```

## 3. 복원 훈련 (분기 1회)

운영 DB를 건드리지 않고 별도 DB로 복원해 확인해요.

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

## 4. 서버 재구축 시 MySQL 되살리기

레포의 `docker-compose-mysql.yml`을 써요. 기존 서버라면 파일 상단 주석의 `docker inspect` 대조 절차를 먼저 해요. 데이터는 볼륨 `mysql-data`(`/var/lib/mysql`)에 있어요.

신규 서버라면:

```bash
docker network create app-network            # 없다면
export DB_PASSWORD=<운영 DB 비밀번호>
sudo -E docker compose -f docker-compose-mysql.yml up -d

# 최신 백업으로 복원 — S3에서 받는 방법은 2-4
sudo reserve-restore /var/backups/reserve/<최신파일>
```

## 5. 모니터링

백업 전용 Promtail job을 반영한 서버는 Loki `{job="backup"}`에서 봐요.

```logql
{job="backup"} |= "backup done"
{job="backup"} |= "upload ok"
{job="backup"} |= "ERROR"
```

최근 26시간 동안 완료 로그가 없으면 알리는 규칙은 [모니터링](monitoring.md)의 설계예요.
설정 파일만으로 설치·발송 성공을 단정하지 않아요. 새 backup 스트림 유입, No data/Error 처리,
연락처와 실제 수신을 확인한 뒤 규칙을 활성화해요. 기존 positions를 초기화하거나 과거 로그를
재주입해서 수집 성공으로 만들지 않아요.

Loki 결과가 비어 있으면 root cron, 원본 `backup.log`, 로컬 덤프와 S3 최신 객체를 각각
읽기 전용으로 대조해요. 수집 실패와 백업 실패는 달라요. 업로더의 PutObject 권한은
HeadObject/GetObject/ListBucket을 보장하지 않으며, 403은 객체가 없다는 증거가 아니에요.

## 6. 복구 범위

- RPO는 24시간이에요. 마지막 백업 이후 데이터는 복구되지 않아요
- `--single-transaction`은 InnoDB 테이블을 전제로 해요. 확인: `SELECT table_name, engine FROM information_schema.tables WHERE table_schema='reserve' AND engine <> 'InnoDB';`

## 7. DB root 비밀번호 무중단 교체

MySQL 8의 이중 비밀번호(`RETAIN CURRENT PASSWORD`)로 옛 값과 새 값을 잠시 함께 허용하고, 쓰는 곳을 하나씩 옮긴 뒤 옛 값을 폐기해요.

| 쓰는 곳 | 계정 | 값이 들어가는 경로 |
|---|---|---|
| 앱(blue/green) | root (`DB_USERNAME` 미설정 → 기본값 root) | GitHub Secret `DB_PASSWORD` → 배포 때 컨테이너 환경 변수 |
| 백업·복원 스크립트 | root | `/etc/reserve-backup.env` |
| 개발 PC IntelliJ `reserve-prod` 데이터 소스 | root | IntelliJ 저장값(SSH 터널) |

- 새 비밀번호는 영문·숫자만 써요([Git 워크플로우](../rules/git-workflow.md))
- 서버에서는 `read -rsp`로 받고, `docker exec`에는 환경 변수 이름만 넘겨요
- GitHub Secret에 넣기 전에 SHA-256 지문(앞 12자)으로 서버 값과 대조해요

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
