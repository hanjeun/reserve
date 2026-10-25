#!/usr/bin/env bash
# 보호된 설정에서 접근 정보를 읽고, 검증된 덤프만 S3에 업로드한다.
# 비밀번호는 프로세스 인자에 노출하지 않는다.

set -euo pipefail
umask 077

# 설정
CONFIG_FILE="${RESERVE_BACKUP_ENV:-/etc/reserve-backup.env}"
if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
fi
# 업로드용 컨테이너가 보호된 설정의 자격증명을 환경변수로 읽도록 내보낸다.
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION

MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
DB_NAME="${DB_NAME:-reserve}"
DB_USER="${DB_USER:-root}"
# DB_PASSWORD 는 설정 파일에서 온다 (필수)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/reserve}"
LOG_FILE="${LOG_FILE:-/var/log/reserve/backup.log}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-3}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"          # 예: reserve-it-kr-backup
S3_PREFIX="${BACKUP_S3_PREFIX:-mysql}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/reserve-${TIMESTAMP}.sql.gz"
DUMP_VERIFIED=0
DUMP_OWNED=0

# 로깅
mkdir -p "$(dirname "$LOG_FILE")" "$BACKUP_DIR"
touch "$LOG_FILE"
chmod 640 "$LOG_FILE"

write_log() {
    local level="$1"
    shift
    # 로그 수집기가 시각과 수준을 파싱할 수 있도록 앱 로그 형식을 따른다.
    echo "$(date '+%Y-%m-%d %H:%M:%S') ${level} [backup] - $*" | tee -a "$LOG_FILE"
}

log() { write_log INFO "$@"; }
warn() { write_log WARN "$@"; }

fail() {
    write_log ERROR "$*"
    # 본 실행이 생성한 미완성 덤프만 지우며 검증 완료 덤프는 복구용으로 보존한다.
    if [[ "$DUMP_OWNED" -eq 1 && -f "$DUMP_FILE" && "$DUMP_VERIFIED" -ne 1 ]]; then
        rm -f "$DUMP_FILE"
    elif [[ "$DUMP_OWNED" -eq 1 && -f "$DUMP_FILE" ]]; then
        write_log WARN "retaining verified local backup after failure: $(basename "$DUMP_FILE")"
    fi
    exit 1
}

# 기존 덤프나 같은 초의 다른 실행을 덮어쓰지 않도록 배타적으로 연다.
open_dump() {
    local -
    set -o noclobber
    exec {DUMP_FD}> "$DUMP_FILE"
}

trap 'fail "unexpected failure at line $LINENO"' ERR

# 사전 점검
log "=== backup start (db=${DB_NAME}) ==="

[[ -n "${DB_PASSWORD:-}" ]] || fail "DB_PASSWORD is not set (check $CONFIG_FILE)"
[[ -n "$S3_BUCKET" ]] || fail "BACKUP_S3_BUCKET is not set; off-site backup is required"
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

# 루틴이 권한 부족으로 조용히 누락되지 않도록 정의 조회 권한을 먼저 확인한다.
ROUTINE_ACCESS="$(docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" --batch --skip-column-names "$DB_NAME" \
    -e "SELECT COUNT(*) FROM information_schema.user_privileges WHERE privilege_type IN ('SHOW_ROUTINE','SELECT') AND grantee = CONCAT(QUOTE(SUBSTRING_INDEX(CURRENT_USER(), '@', 1)), '@', QUOTE(SUBSTRING_INDEX(CURRENT_USER(), '@', -1)));")" \
    || fail "cannot verify stored routine definition access"
[[ "$ROUTINE_ACCESS" =~ ^[0-9]+$ ]] || fail "invalid stored routine access result"
[[ "$ROUTINE_ACCESS" -gt 0 ]] \
    || fail "stored routine definitions are not readable; check SHOW_ROUTINE before backup"

# 단일 트랜잭션 백업의 전제를 확인하며 동시 DDL은 별도로 통제한다.
TABLE_ENGINES="$(docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" --batch --skip-column-names "$DB_NAME" \
    -e "SELECT COUNT(*), COALESCE(SUM(ENGINE IS NULL OR ENGINE <> 'InnoDB'), 0) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE';")" \
    || fail "cannot verify table storage engines"
[[ "$TABLE_ENGINES" =~ ^[1-9][0-9]*$'\t'0$ ]] \
    || fail "backup requires visible InnoDB base tables; invalid or unsupported storage engine metadata"

# 일관된 InnoDB 스냅샷에 루틴·트리거·이벤트를 포함한다.
# 불필요한 PROCESS 권한과 GTID 충돌은 피하며, 일반 테이블스페이스는 별도 복원 설계가 필요하다.
open_dump || fail "dump path already exists or cannot be created"
DUMP_OWNED=1
log "dumping..."
set +e
docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
    mysqldump \
        --user="$DB_USER" \
        --single-transaction \
        --quick \
        --no-tablespaces \
        --routines \
        --triggers \
        --events \
        --set-gtid-purged=OFF \
        --default-character-set=utf8mb4 \
        "$DB_NAME" 2>>"$LOG_FILE" | gzip -c >&"$DUMP_FD"
PIPE_STATUSES=("${PIPESTATUS[@]}")
exec {DUMP_FD}>&-
DUMP_STATUS="${PIPE_STATUSES[0]}"
GZIP_STATUS="${PIPE_STATUSES[1]}"
set -e

[[ "$DUMP_STATUS" -eq 0 ]] || fail "mysqldump exited with status $DUMP_STATUS"
[[ "$GZIP_STATUS" -eq 0 ]] || fail "gzip exited with status $GZIP_STATUS"

# 덤프 무결성을 확인한 뒤에만 업로드한다.
gzip -t "$DUMP_FILE" 2>/dev/null || fail "gzip integrity check failed"

# 정상 종료 마커로 중단된 덤프를 걸러낸다.
if ! gunzip -c "$DUMP_FILE" | tail -5 | grep -q "Dump completed"; then
    fail "dump is truncated (no 'Dump completed' marker)"
fi

DUMP_SIZE="$(stat -c %s "$DUMP_FILE")"
[[ "$DUMP_SIZE" -gt 1024 ]] || fail "dump suspiciously small (${DUMP_SIZE} bytes)"
# s3:PutObject 권한만 사용하며, 단일 업로드 상한을 넘으면 백업 구조를 다시 설계한다.
[[ "$DUMP_SIZE" -le 5368709120 ]] \
    || fail "dump exceeds the 5GB single PutObject limit; configure controlled multipart upload"

TABLE_COUNT="$(gunzip -c "$DUMP_FILE" | grep -c '^CREATE TABLE' || true)"
log "verified: $(numfmt --to=iec "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE}B"), ${TABLE_COUNT} tables"

# 잘못된 대상이나 제한된 조회 권한으로 테이블이 누락된 덤프를 거부한다.
if [[ "$TABLE_COUNT" -lt 10 ]]; then
    fail "only ${TABLE_COUNT} tables in dump — expected at least 10. Check DB_NAME and grants."
fi
DUMP_VERIFIED=1

# S3 업로드
OBJECT_KEY="${S3_PREFIX:+${S3_PREFIX%/}/}$(basename "$DUMP_FILE")"
S3_URI="s3://${S3_BUCKET}/${OBJECT_KEY}"
log "uploading to ${S3_URI}"

if command -v aws >/dev/null 2>&1; then
    aws s3api put-object \
        --bucket "$S3_BUCKET" \
        --key "$OBJECT_KEY" \
        --body "$DUMP_FILE" \
        --if-none-match "*" \
        --server-side-encryption AES256 \
        --output text >/dev/null \
        || fail "S3 upload failed"
else
    # AWS CLI 미설치 서버 폴백. 자격증명은 환경변수로만 넘긴다.
    docker run --rm \
        -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
        -v "${BACKUP_DIR}:/backup:ro" \
        amazon/aws-cli:latest \
        s3api put-object \
        --bucket "$S3_BUCKET" \
        --key "$OBJECT_KEY" \
        --body "/backup/$(basename "$DUMP_FILE")" \
        --if-none-match "*" \
        --server-side-encryption AES256 \
        --output text >/dev/null \
        || fail "S3 upload failed (docker fallback)"
fi
log "upload ok"

# 로컬 보관 정리
DELETED="$(find "$BACKUP_DIR" -name 'reserve-*.sql.gz' -mtime "+${LOCAL_RETENTION_DAYS}" -print -delete | wc -l)"
if [[ "$DELETED" -gt 0 ]]; then
    log "pruned ${DELETED} local backup(s) older than ${LOCAL_RETENTION_DAYS} days"
fi

REMAINING="$(find "$BACKUP_DIR" -name 'reserve-*.sql.gz' | wc -l)"
log "=== backup done (${REMAINING} local copies) ==="
