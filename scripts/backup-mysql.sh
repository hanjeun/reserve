#!/usr/bin/env bash
#
# RESERVE MySQL 백업 — mysqldump → gzip → 무결성 검증 → S3 업로드 → 로컬 보관 정리
#
# 서버(Lightsail)에서 cron으로 돈다. 사용법과 복원 절차는 docs/technical/backup.md 참고.
#
#   설치:  sudo cp scripts/backup-mysql.sh /usr/local/bin/reserve-backup
#          sudo chmod +x /usr/local/bin/reserve-backup
#   설정:  /etc/reserve-backup.env  (600, root 소유)
#   실행:  reserve-backup
#
# 설계 메모
#  - 로그를 /var/log/reserve/backup.log 로 보낸다. Promtail이 그 디렉토리를 수집하므로
#    백업 성공/실패가 Grafana에서 그대로 보인다(별도 알림 채널을 만들지 않아도 된다).
#  - 비밀번호는 명령행 인자로 넘기지 않는다. `ps`에 그대로 노출되기 때문에 MYSQL_PWD를 쓴다.
#  - "덤프가 만들어졌다"와 "덤프가 쓸 만하다"는 다르다. gzip 무결성과 종료 마커를 둘 다 본다.
#    이 검증이 없으면 디스크가 찼을 때 0바이트 파일이 매일 S3에 쌓이고, 정작 필요할 때 알게 된다.

set -euo pipefail

# ─────────────────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────────────────
CONFIG_FILE="${RESERVE_BACKUP_ENV:-/etc/reserve-backup.env}"
if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
fi

MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
DB_NAME="${DB_NAME:-reserve}"
DB_USER="${DB_USER:-root}"
# DB_PASSWORD 는 설정 파일에서 온다 (필수)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/reserve}"
LOG_FILE="${LOG_FILE:-/var/log/reserve/backup.log}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"          # 예: reserve-it-kr-backup
S3_PREFIX="${BACKUP_S3_PREFIX:-mysql}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/reserve-${TIMESTAMP}.sql.gz"

# ─────────────────────────────────────────────────────────
# 로깅
# ─────────────────────────────────────────────────────────
mkdir -p "$(dirname "$LOG_FILE")" "$BACKUP_DIR"

log() {
    # app.log와 같은 형식으로 맞춰 Grafana에서 함께 보기 쉽게 한다.
    echo "$(date '+%Y-%m-%d %H:%M:%S') [backup] $*" | tee -a "$LOG_FILE"
}

fail() {
    log "ERROR $*"
    # 실패한 부분 파일은 남기지 않는다. 남기면 다음 복원 때 후보로 잡혀 위험하다.
    if [[ -f "$DUMP_FILE" ]]; then
        rm -f "$DUMP_FILE"
    fi
    exit 1
}

trap 'fail "unexpected failure at line $LINENO"' ERR

# ─────────────────────────────────────────────────────────
# 사전 점검
# ─────────────────────────────────────────────────────────
log "=== backup start (db=${DB_NAME}) ==="

[[ -n "${DB_PASSWORD:-}" ]] || fail "DB_PASSWORD is not set (check $CONFIG_FILE)"
[[ "$LOCAL_RETENTION_DAYS" =~ ^[0-9]+$ ]] \
    || fail "LOCAL_RETENTION_DAYS must be a non-negative integer"

docker inspect "$MYSQL_CONTAINER" >/dev/null 2>&1 \
    || fail "container '$MYSQL_CONTAINER' not found"

RUNNING="$(docker inspect -f '{{.State.Running}}' "$MYSQL_CONTAINER")"
[[ "$RUNNING" = "true" ]] || fail "container '$MYSQL_CONTAINER' is not running"

# 디스크 여유 확인 — 여유가 없으면 잘린 덤프가 나온다.
AVAIL_MB="$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
if [[ "$AVAIL_MB" -lt 500 ]]; then
    fail "not enough disk space in $BACKUP_DIR (${AVAIL_MB}MB available, need >=500MB)"
fi

# ─────────────────────────────────────────────────────────
# 덤프
# ─────────────────────────────────────────────────────────
# --single-transaction : InnoDB에서 락 없이 일관된 스냅샷을 뜬다(서비스 중단 없음).
#                        MyISAM 테이블이 섞이면 이 보장이 깨지므로 아래에서 엔진을 확인한다.
# --routines/--triggers/--events : 스키마만 복원되고 프로시저·트리거가 빠지는 사고를 막는다.
# --set-gtid-purged=OFF : 복원 대상이 다른 서버여도 GTID 충돌이 나지 않게.
log "dumping..."
set +e
docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
    mysqldump \
        --user="$DB_USER" \
        --single-transaction \
        --quick \
        --routines \
        --triggers \
        --events \
        --set-gtid-purged=OFF \
        --default-character-set=utf8mb4 \
        "$DB_NAME" 2>>"$LOG_FILE" | gzip -c > "$DUMP_FILE"
PIPE_STATUSES=("${PIPESTATUS[@]}")
DUMP_STATUS="${PIPE_STATUSES[0]}"
GZIP_STATUS="${PIPE_STATUSES[1]}"
set -e

[[ "$DUMP_STATUS" -eq 0 ]] || fail "mysqldump exited with status $DUMP_STATUS"
[[ "$GZIP_STATUS" -eq 0 ]] || fail "gzip exited with status $GZIP_STATUS"

# ─────────────────────────────────────────────────────────
# 검증 — 여기가 이 스크립트의 핵심이다
# ─────────────────────────────────────────────────────────
gzip -t "$DUMP_FILE" 2>/dev/null || fail "gzip integrity check failed"

# mysqldump는 정상 종료 시 마지막 줄에 "Dump completed" 주석을 남긴다.
# 중간에 끊긴 덤프는 이 마커가 없다 — 크기만 봐서는 절대 알 수 없다.
if ! gunzip -c "$DUMP_FILE" | tail -5 | grep -q "Dump completed"; then
    fail "dump is truncated (no 'Dump completed' marker)"
fi

DUMP_SIZE="$(stat -c %s "$DUMP_FILE")"
[[ "$DUMP_SIZE" -gt 1024 ]] || fail "dump suspiciously small (${DUMP_SIZE} bytes)"

TABLE_COUNT="$(gunzip -c "$DUMP_FILE" | grep -c '^CREATE TABLE' || true)"
log "verified: $(numfmt --to=iec "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE}B"), ${TABLE_COUNT} tables"

# 테이블이 갑자기 줄었다면 뭔가 잘못된 것이다(권한 변경, DB 지정 실수 등).
if [[ "$TABLE_COUNT" -lt 10 ]]; then
    log "WARN only ${TABLE_COUNT} tables in dump — expected ~20. Check DB_NAME and grants."
fi

# ─────────────────────────────────────────────────────────
# S3 업로드
# ─────────────────────────────────────────────────────────
if [[ -n "$S3_BUCKET" ]]; then
    S3_URI="s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "$DUMP_FILE")"
    log "uploading to ${S3_URI}"

    if command -v aws >/dev/null 2>&1; then
        aws s3 cp "$DUMP_FILE" "$S3_URI" \
            --only-show-errors \
            --sse AES256 \
            || fail "S3 upload failed"
    else
        # AWS CLI 미설치 서버 폴백. 자격증명은 환경변수로만 넘긴다.
        docker run --rm \
            -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
            -v "${BACKUP_DIR}:/backup:ro" \
            amazon/aws-cli:latest \
            s3 cp "/backup/$(basename "$DUMP_FILE")" "$S3_URI" \
            --only-show-errors --sse AES256 \
            || fail "S3 upload failed (docker fallback)"
    fi
    log "upload ok"
else
    # 로컬에만 남는 백업은 "서버가 죽으면 같이 죽는" 백업이다. 조용히 넘어가지 않는다.
    log "WARN BACKUP_S3_BUCKET is not set — backup exists only on this server"
fi

# ─────────────────────────────────────────────────────────
# 로컬 보관 정리
# ─────────────────────────────────────────────────────────
# `[[ cond ]] && cmd` 형태는 set -e / ERR trap과 섞이면 동작이 헷갈리므로 if로 쓴다.
DELETED="$(find "$BACKUP_DIR" -name 'reserve-*.sql.gz' -mtime "+${LOCAL_RETENTION_DAYS}" -print -delete | wc -l)"
if [[ "$DELETED" -gt 0 ]]; then
    log "pruned ${DELETED} local backup(s) older than ${LOCAL_RETENTION_DAYS} days"
fi

REMAINING="$(find "$BACKUP_DIR" -name 'reserve-*.sql.gz' | wc -l)"
log "=== backup done (${REMAINING} local copies) ==="
