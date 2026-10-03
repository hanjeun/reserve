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
| 로그 | `/var/log/reserve/backup.log` → Alloy → Loki → Grafana |

백업은 `/etc/reserve-backup.env`, 관리자 복원은 `/etc/reserve-restore.env`의 해당 계정 비밀번호를 사용해요. 앱·백업·관리자 비밀번호를 서로 복사하지 않아요.

> **2026-10-02 검증:** 별도 읽기 접근으로 받은 S3 객체 `mysql/reserve-20260930-181001.sql.gz`는
> 13,883바이트이며 SHA-256은 `8c886711714827452cbb9e813c49520b58ddbed784791e830e0428c06064f1d6`이다.
> Linux MySQL **8.0.45**에 독립 복원해 34테이블·66행과 34개 테이블의 `CHECK TABLE` 성공을 확인했다.
> 암호화 채팅 사진 1건도 독립 다운로드·무결성 확인 후 사용자가 별도 보관 키를 숨김 입력해 복호화 `PASS`를 확인했다.
> 운영 설치본과 **10/2 03:10 KST 정기 백업의 34테이블 검증·업로드·종료 기록**을 확인했다.
> 이후 백업 역할과 `--no-tablespaces`를 적용했다. 10/3 03:10 KST 정기 실행은 `reserve_backup` 계정으로
> 34테이블·13,943바이트·gzip 무결성·덤프 종료 표시·업로드·정상 종료를 확인했다. 같은 실행의 로그 6줄도 Loki에서 조회됐다.
> 10/3 재로그인한 AWS CloudShell의 별도 읽기 접근으로 `mysql/reserve-20261002-181001.sql.gz`를 내려받았다.
> 서버 원본·CloudShell·PC 다운로드의 SHA-256은 모두
> `ef3e38c17bc8ab657f5578b8bf313371b145066cd0a598a5eb5dd902cef28feb`였다.
> PC의 격리 MySQL **8.0.45**에서 34테이블·62행을 복원하고 `CHECK TABLE` 34건을 통과했다.
> 같은 격리 DB의 `token_hash VARCHAR(60) NULL` 추가도 `ALGORITHM=INSTANT`로 확인했다.
> 이 새 백업의 DB 복원과 앞선 운영 이미지·사진 복구 검증은 서로 다른 검증 범위다.
> 현재 운영 이미지까지 사용하는 격리 복구도 통과했다. 이전 백업에 없는
> `store.image_autoplay_enabled`는 스키마 갱신으로 추가한 뒤 검증 모드로 재기동했고,
> 기존 34테이블의 원래 컬럼 값·66행을 유지했다. 상세 범위와 미검증 항목은 2-5를 따른다.

## 1. 설치 (서버에서 1회)

### 1-1. 스크립트 배치

```bash
# 레포에서 서버로 (또는 git pull 후 서버 경로에서)
sudo cp scripts/backup-mysql.sh  /usr/local/bin/reserve-backup
sudo cp scripts/restore-mysql.sh /usr/local/bin/reserve-restore
sudo chmod +x /usr/local/bin/reserve-backup /usr/local/bin/reserve-restore

sudo install -d -m 700 -o root -g root /var/backups/reserve
```

서버에 레포가 없으면 승인된 스크립트 커밋의 파일을 받아 해시를 대조한 뒤 설치해요.
현재 계정 분리 스크립트는 운영 앱 v2.8.3보다 새 버전이에요. 앱 태그만 보고 옛 설치본으로 되돌리지 않아요.

```bash
SCRIPT_REF=228d1dfbbc7050f282c2d6efe8e8d178c10dd0a3
curl -fsSL -o /tmp/reserve-backup  https://raw.githubusercontent.com/hanjeun/reserve/$SCRIPT_REF/scripts/backup-mysql.sh
curl -fsSL -o /tmp/reserve-restore https://raw.githubusercontent.com/hanjeun/reserve/$SCRIPT_REF/scripts/restore-mysql.sh
sha256sum /tmp/reserve-backup /tmp/reserve-restore   # 레포의 같은 커밋 파일 해시와 같아야 한다
sudo install -m 0755 /tmp/reserve-backup /tmp/reserve-restore /usr/local/bin/
```

### 1-2. 설정 파일

신규 서버에서는 백업 전용 계정을 먼저 만들고 그 비밀번호를 숨김 입력해요. 앱 비밀번호를 복사하지 않아요.
기존 설정이 있으면 아래 신규 생성 절차를 중단하고 해당 계정의 교체 절차를 따라요.
업로드는 스크립트의 docker 폴백(`amazon/aws-cli`)이 해요.

```bash
(
  set -euo pipefail
  sudo test ! -e /etc/reserve-backup.env
  read -rsp 'reserve_backup DB_PASSWORD: ' DBPW; echo
  read -rsp 'AWS_ACCESS_KEY_ID: ' AK; echo
  read -rsp 'AWS_SECRET_ACCESS_KEY: ' SK; echo
  test -n "$DBPW" && test -n "$AK" && test -n "$SK"
  sudo install -m 600 -o root -g root /dev/null /etc/reserve-backup.env
  printf 'DB_USER=reserve_backup\nDB_PASSWORD=%q\nBACKUP_S3_BUCKET=reserve-it-kr-backup\nBACKUP_S3_PREFIX=mysql\nLOCAL_RETENTION_DAYS=7\nAWS_ACCESS_KEY_ID=%q\nAWS_SECRET_ACCESS_KEY=%q\nAWS_DEFAULT_REGION=ap-northeast-2\n' \
    "$DBPW" "$AK" "$SK" | sudo tee /etc/reserve-backup.env >/dev/null
  unset AK SK DBPW
  sudo stat -c '%a %U %n' /etc/reserve-backup.env
)
```

AWS 키는 백업 전용 사용자 `reserve-backup-uploader`의 키를 써요.

### DB 역할 분리와 복원 설정

2026-10-02 승인된 운영 변경으로 백업은 `reserve_backup@localhost`를 사용해요.
`SELECT`·`SHOW VIEW`·`SHOW_ROUTINE`·`TRIGGER`·`EVENT`와 `--no-tablespaces`로
34개 테이블의 덤프 정의·종료 표식을 확인한 뒤 `/etc/reserve-backup.env`를 전환했어요.
앱용 DML 계정과 DDL 계정은 실제 Docker 서브넷에 한정했으며, 현재 운영 이미지의 앱 접속도 전환했어요.
앱의 `ddl-auto: update`에 DDL 권한부터 제거하지 않아요. 필요한 스키마를 DDL 단계에서 맞춘 뒤
앱은 `ddl-auto: validate`로 기동해야 해요.

복원 관리자 설정은 `/etc/reserve-restore.env`(root 소유, 600)에 따로 보관해요.
`RESERVE_RESTORE_ENV`로 명시한 경로가 우선이며, 기존 `RESERVE_BACKUP_ENV` 명시도 호환돼요.
두 변수를 지정하지 않았고 복원 설정이 없을 때만 기존 `/etc/reserve-backup.env`로 돌아가요.
백업 계정은 데이터 쓰기 권한이 없으므로 복원이나 관리자 SQL에 쓰지 않아요.
변경 전 원본은 `/var/backups/reserve-scripts/20261002-before-db-roles/`에 보관했어요.
전환 후 첫 10/3 03:10 KST 정기 백업은 이 계정으로 덤프 검증·업로드·종료를 마쳤고, 위 독립 복원도 통과했어요.

MySQL **8.0.45** 격리 시험에서 검증한 권한 후보는 다음과 같다. 호스트 범위는 실제 컨테이너
접속 경로에 맞춰 제한하고, 계정 암호는 보호된 입력으로 생성한다. 아래 `localhost`는 시험 범위다.

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON reserve.* TO 'reserve_app'@'localhost';
GRANT SELECT, CREATE, ALTER, DROP, INDEX, REFERENCES ON reserve.* TO 'reserve_ddl'@'localhost';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT ON reserve.* TO 'reserve_backup'@'localhost';
GRANT SHOW_ROUTINE ON *.* TO 'reserve_backup'@'localhost';
```

`SHOW_ROUTINE`이 없으면 `mysqldump --routines`가 **종료 코드 0으로도 프로시저 본문을 생략**했다.
이때 `information_schema.routines`에서도 해당 객체가 숨겨져 0건 조회가 안전한 근거가 되지 않았다.
로컬 후보는 덤프 전에 전용 계정의 직접 `SHOW_ROUTINE` 권한을 확인하고, 없으면 파일 생성·업로드 전에
중단한다. 기존 관리자와의 호환을 위해 직접 전역 `SELECT` 권한도 인식하지만 백업 전용 계정에는
부여하지 않는다. 역할을 통해 간접 부여하는 구성은 이 후보의 검증 범위 밖이다.
이 권한은 전역 프로시저·함수 정의를 조회하지만 전역 테이블 `SELECT` 권한은 주지 않는다.
`TRIGGER`·`EVENT`는 해당 객체를 만드는 권한도 포함하므로 백업 계정을 절대적인 읽기 전용 계정으로
표현하지 않는다. 시험에서는 백업 계정의 데이터 쓰기, 앱 계정의 DDL, DDL 계정의 데이터 쓰기가 거부됐다.
데이터 마이그레이션에 필요한 별도 DML 권한은 해당 변경의 승인 범위에서만 추가한다.

로컬 백업 후보는 `--no-tablespaces`로 불필요한 `PROCESS` 권한 요구를 제거했다.
운영 앱 테이블은 사용자 정의 general tablespace에 속하지 않았고 GTID는 OFF였다.
사용자 정의 general tablespace·GTID·엔진 구성이 바뀌면 이 전제를 다시 검증한다.
12개 InnoDB 테이블과 뷰·프로시저·트리거·이벤트를 만든 뒤 **현재 백업 스크립트 → gzip → 실제 복원**을
통과했다. S3 업로드만 stub으로 대체했으므로 이 시험은 업로드나 운영 권한 변경의 증거가 아니다.

```powershell
python -B scripts/tests/backup-mysql-roles_test.py --run --docker-host npipe:////./pipe/dockerDesktopLinuxEngine --bash 'C:\Program Files\Git\bin\bash.exe'
```

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

### 2-5. 백업과 앱 버전의 스키마 호환 확인

백업 생성 뒤 필드가 추가됐으면 SQL 복원이 성공해도 최신 앱이 바로 기동하지 않을 수 있다.
**백업 객체 → MySQL 복원 → 해당 앱 이미지의 스키마 대조 → 앱 기동 → 실제 API 본문**을
한 묶음으로 확인한다. 변경 전 백업과 이미지를 보존하고, 필요한 DDL을 승인한 뒤 적용한다.
백업의 스키마를 최신 스키마와 같다고 가정하지 않는다.

10/2에는 실제 운영 이미지
`hanjeun/reserve@sha256:be607831a3a095a47c3b92eacf83956400bd34f0036d6c0653077ae9b47b21fe`
와 독립 S3 백업을 Linux MySQL 8.0.45 격리 컨테이너에서 함께 확인했다.
처음 `ddl-auto: validate` 기동은 `store.image_autoplay_enabled` 누락으로 실패했다.
격리 DDL 계정으로 현재 앱의 `update`를 실행하자 이 컬럼 하나가 추가됐고,
원래 컬럼 값을 행별로 직렬화한 해시와 행 수가 모두 같았다.
그 뒤 데이터 조회 권한만 가진 시험 계정으로 `validate` 기동과 컨테이너 재시작을 통과했다.

- 직접 Actuator는 JSON `status=UP`, 가게 목록 API는 `success=true`·배열 본문이었다.
- 재시작 전후 34테이블의 `CHECKSUM TABLE ... EXTENDED` 결과와 기존 데이터 해시가 같았다.
- `JAVA_OPTS`의 heap·GC·시스템 속성이 실제 PID 1의 Java 인자에 포함됐고 실행 UID는 100이었다.
- 외부 통신은 차단했고, 메일·PG·AWS·OAuth에는 합성 키만 사용했다. 시험 컨테이너는 제거했다.

이 검증은 **DB와 현재 백엔드 이미지의 격리 복구** 범위다. 운영 서버 중단·재부팅,
nginx Blue/Green 실패 전환, 이전 프론트 lazy 자산의 보존, 실제 PG·S3 호출과
앱에서의 전체 사진·과거 암호화 키 호환은 별도 검증한다.

## 3. 복원 훈련 (분기 1회)

운영 DB를 건드리지 않고 별도 DB로 복원해 확인해요.

```bash
# 관리자 복원 설정은 root 셸 안에서만 읽는다. 백업 계정으로 복원하지 않는다.
sudo bash <<'BASH'
set -euo pipefail
. /etc/reserve-restore.env
export MYSQL_PWD="${DB_PASSWORD:?}"

# 아래 고정 이름의 기존 훈련 DB가 있으면 덮어쓴다. 운영 DB는 대상이 아니다.
F=$(find /var/backups/reserve -maxdepth 1 -name 'reserve-*.sql.gz' -type f | sort | tail -n 1)
test -n "$F"
reserve-restore --dry-run "$F"
reserve-restore --target reserve_restore_test "$F"

# 백업 시각 이후의 운영 변경은 DIFF가 날 수 있다.
docker exec -e MYSQL_PWD -e DB_USER="${DB_USER:-root}" mysql sh -c '
  set -eu
  tables=$(mysql --user="$DB_USER" -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema=\"reserve\"")
  for t in $tables; do
    a=$(mysql --user="$DB_USER" -N -e "SELECT COUNT(*) FROM reserve.$t")
    b=$(mysql --user="$DB_USER" -N -e "SELECT COUNT(*) FROM reserve_restore_test.$t")
    if [ "$a" = "$b" ]; then echo "same $t $a"; else echo "DIFF $t prod=$a restored=$b"; fi
  done'

# 대조 후 훈련 DB 하나만 제거한다. 운영 데이터베이스 이름으로 바꾸지 않는다.
docker exec -e MYSQL_PWD mysql mysql --user="${DB_USER:-root}" -e 'DROP DATABASE reserve_restore_test;'
unset MYSQL_PWD DB_PASSWORD
BASH
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

최근 26시간 동안 완료 로그가 없으면 알리는 규칙은 [모니터링](monitoring.md)을 따라요.
운영 설치본의 26시간 창·No data/Error Alerting과 활성 상태를 확인했어요. 실제 정기 실행의 새
backup 스트림과 자연 평가·메일 수신은 별도로 확인해요. 기존 메일 한 경로를 유지해요. 기존 positions를 초기화하거나 과거 로그를
재주입해서 수집 성공으로 만들지 않아요.

Loki 결과가 비어 있으면 root cron, 원본 `backup.log`, 로컬 덤프와 S3 최신 객체를 각각
읽기 전용으로 대조해요. 수집 실패와 백업 실패는 달라요. 업로더의 PutObject 권한은
HeadObject/GetObject/ListBucket을 보장하지 않으며, 403은 객체가 없다는 증거가 아니에요.

## 6. 복구 범위

- RPO는 24시간이에요. 마지막 백업 이후 데이터는 복구되지 않아요
- `--single-transaction`은 InnoDB 테이블을 전제로 해요. 확인: `SELECT table_name, engine FROM information_schema.tables WHERE table_schema='reserve' AND engine <> 'InnoDB';`

## 7. 운영 DB 계정과 비밀번호 교체

2026-10-02 같은 운영 이미지에서 앱 접속을 `reserve_app`으로 바꾸고 Hibernate를
`validate`로 전환했어요. 엔티티 33개를 제한된 계정으로 먼저 검증했고, 전환 뒤
건강 검사·공개 JSON API·앱 연결 10개·읽기 전용 verifier가 통과했어요.
원래 컨테이너와 설정은 `/var/backups/reserve-scripts/20261002-before-db-roles/`에
보존해요. 계정 전환은 새 앱 버전 배포와 별개예요.

새 릴리스의 blue/green Compose는 앱 계정과 `validate`를 고정해요.
`DB_APP_PASSWORD`가 비면 Compose와 배포 시작 단계가 실패하며 root 비밀번호로 대체하지 않아요.
새 배포 작업에는 관리자 Secret `DB_PASSWORD`를 전달하지 않아요. 이전 main의 재실행은
여전히 옛 설정을 사용하므로 피하고, 기존 `DB_USERNAME`·`DB_DDL_AUTO` Variables는
새 릴리스 적용 전까지 유지해요.

| 대상 | 계정·권한 | 설정 위치 |
|---|---|---|
| 앱 | `reserve_app@172.18.0.0/255.255.0.0`, SELECT·INSERT·UPDATE·DELETE | 서버 컨테이너; 새 Compose는 `reserve_app`·`validate` 고정, GitHub Secret `DB_APP_PASSWORD` |
| DDL | `reserve_ddl@172.18.0.0/255.255.0.0`, SELECT·CREATE·ALTER·DROP·INDEX·REFERENCES | 서버 역할 보관본; 자동 실행하지 않음 |
| 백업 | `reserve_backup@localhost`, SELECT·SHOW VIEW·TRIGGER·EVENT·SHOW_ROUTINE | `/etc/reserve-backup.env` |
| 복원·관리자 | root | `/etc/reserve-restore.env`; 기존 GitHub 관리자 Secret `DB_PASSWORD` |

백업 역할은 데이터 쓰기 권한이 없지만 TRIGGER·EVENT 정의 권한을 포함하므로
절대적인 읽기 전용 계정으로 설명하지 않아요. 역할 보관본은 `/etc/reserve-db-roles.json`
(root 600)에 있어요. 키·비밀번호 값은 명령 출력이나 문서에 남기지 않아요.

새 릴리스의 스키마는 해당 JAR로 `scripts/VerifyDatabaseSchema.java`를 실행해
확인해요. 이 도구는 앱을 부팅하지 않고 제한된 앱 계정으로 스키마만 검증해요.
필요한 DDL은 대상·롤백을 검토해 별도로 적용하며 검증 실패를 `update`로 우회하지 않아요.

비밀번호는 역할마다 독립적으로 교체해요. root 교체 시 앱·백업 비밀번호를 root 값으로
바꾸거나 기존 main CI를 재실행하지 않아요. 해당 계정에 새 비밀번호를 추가하고
(RETAIN CURRENT PASSWORD), 해당 계정의 설정만 갱신해 연결을 검증해요.
관리자는 복원 설정과 GitHub 관리자 Secret, 앱은 앱 Secret과 접속 설정,
백업은 백업 설정과 실제 덤프를 확인해요. 해당 사용처가 전부 전환된 뒤 그 계정의
옛 비밀번호만 DISCARD OLD PASSWORD로 폐기해요. 교체 전에는 구체적인 운영 승인과
복구 경로를 확인해요.

## 복원 훈련 이력

| 날짜 | 대상 | 확인한 범위 |
|---|---|---|
| 2026-10-02 | S3 `reserve-20260930-181001.sql.gz`, 34 tables·13,883 bytes | Linux MySQL 8.0.45 독립 복원 34테이블·66행, `CHECK TABLE` 34건 성공; 원본 객체 해시 확인, 운영 DB 불변; 새 정기 백업은 별도 확인 |
| 2026-10-02 | 최소 권한 합성 fixture | 현재 백업 스크립트로 12테이블·뷰·프로시저·트리거·이벤트 복원 성공; `SHOW_ROUTINE` 누락 시 성공 코드의 프로시저 생략 재현; S3 업로드 stub, 운영 계정 불변 |
| 2026-10-03 | S3 `reserve-20261002-181001.sql.gz`, 34 tables·13,943 bytes | CloudShell·PC 독립 다운로드와 서버 SHA-256 일치; 격리 MySQL 8.0.45 복원 34테이블·62행 및 `CHECK TABLE` 34건 성공; `token_hash` INSTANT DDL 확인; 운영 DB 복원 아님 |
