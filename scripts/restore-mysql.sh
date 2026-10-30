#!/usr/bin/env bash
# 운영 DB 복원은 앱의 쓰기를 멈추고 현재 상태를 보존한 뒤에만 진행한다.
# --dry-run은 덤프만 검사하고, --target은 별도 복원 DB를 지정한다.

set -euo pipefail
umask 077

CONFIG_FILE="${RESERVE_RESTORE_ENV:-${RESERVE_BACKUP_ENV:-/etc/reserve-restore.env}}"
if [[ ! -f "$CONFIG_FILE" && -z "${RESERVE_RESTORE_ENV+x}" && -z "${RESERVE_BACKUP_ENV+x}" ]]; then
    CONFIG_FILE=/etc/reserve-backup.env
fi
if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
fi
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION

MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
DB_NAME="${DB_NAME:-reserve}"
DB_USER="${DB_USER:-root}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/reserve}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_PREFIX="${BACKUP_S3_PREFIX:-mysql}"

TARGET_DB="$DB_NAME"
DRY_RUN=0

die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

# 인자 파싱
SOURCE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --list)
            echo "=== local (${BACKUP_DIR}) ==="
            ls -lh "${BACKUP_DIR}"/reserve-*.sql.gz 2>/dev/null || echo "(none)"
            if [[ -n "$S3_BUCKET" ]]; then
                echo
                echo "=== s3 (s3://${S3_BUCKET}/${S3_PREFIX}/) ==="
                aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" --human-readable || echo "(unavailable)"
            fi
            exit 0
            ;;
        --dry-run) DRY_RUN=1; shift ;;
        --target)  TARGET_DB="${2:-}"; [[ -n "$TARGET_DB" ]] || die "--target needs a value"; shift 2 ;;
        -h|--help) usage 0 ;;
        -*)        die "unknown option: $1" ;;
        *)         SOURCE="$1"; shift ;;
    esac
done

[[ -n "$SOURCE" ]] || usage 1
[[ "$TARGET_DB" =~ ^[A-Za-z0-9_]+$ ]] \
    || die "target database must contain only letters, numbers, and underscores"
if [[ "$TARGET_DB" != "$DB_NAME" && ! "$TARGET_DB" =~ ^reserve_restore_[A-Za-z0-9_]+$ ]]; then
    die "target must be the configured database or start with reserve_restore_"
fi

# 백업 파일 준비
WORK_FILE=""
CLEANUP_WORK=0

cleanup() {
    if [[ "$CLEANUP_WORK" -eq 1 && -n "$WORK_FILE" ]]; then
        rm -f "$WORK_FILE"
    fi
}
trap cleanup EXIT

case "$SOURCE" in
    s3://*)
        WORK_FILE="$(mktemp /tmp/reserve-restore-XXXXXX.sql.gz)"
        CLEANUP_WORK=1
        echo "downloading $SOURCE ..."
        aws s3 cp "$SOURCE" "$WORK_FILE" --only-show-errors || die "S3 download failed"
        ;;
    *)
        [[ -f "$SOURCE" ]] || die "file not found: $SOURCE"
        WORK_FILE="$SOURCE"
        ;;
esac

# 손상된 덤프로 운영 DB를 덮어쓰지 않도록 먼저 검증한다.
echo "verifying dump..."
gzip -t "$WORK_FILE" || die "gzip integrity check failed"
gunzip -c "$WORK_FILE" | tail -5 | grep -q "Dump completed" \
    || die "dump is truncated (no 'Dump completed' marker)"

TABLE_COUNT="$(gunzip -c "$WORK_FILE" | grep -c '^CREATE TABLE' || true)"
DUMP_DATE="$(gunzip -c "$WORK_FILE" | grep -m1 -o 'Dump completed on .*' || echo 'unknown')"
echo "  tables : ${TABLE_COUNT}"
echo "  ${DUMP_DATE}"

[[ "$TABLE_COUNT" -ge 10 ]] \
    || die "dump has only ${TABLE_COUNT} tables (expected at least 10)"

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "dry-run: dump is valid. nothing was changed."
    exit 0
fi

# 운영 DB를 덮어쓸 때는 대상을 명시적으로 확인한다.
docker inspect "$MYSQL_CONTAINER" >/dev/null 2>&1 || die "container '$MYSQL_CONTAINER' not found"
[[ -n "${DB_PASSWORD:-}" ]] || die "DB_PASSWORD is not set (check $CONFIG_FILE)"

container_running() {
    local container=$1
    [[ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true)" = "true" ]]
}

if [[ "$TARGET_DB" = "$DB_NAME" ]] && (container_running blue || container_running green); then
    die "stop both blue and green app containers before restoring the production database"
fi

echo
echo "  source : ${SOURCE}"
echo "  target : ${TARGET_DB} (container: ${MYSQL_CONTAINER})"
echo

if [[ "$TARGET_DB" = "$DB_NAME" ]]; then
    cat <<WARN
⚠️  운영 DB '${DB_NAME}' 를 덮어씁니다. 이 시점 이후의 데이터는 사라집니다.
    - 먼저 현재 상태를 한 번 더 백업했습니까? (scripts/backup-mysql.sh)
    - 앱 컨테이너(blue/green)를 멈춰 쓰기를 차단했습니까?
WARN
    printf "계속하려면 정확히 'RESTORE %s' 를 입력하세요: " "$DB_NAME"
    read -r CONFIRM
    [[ "$CONFIRM" = "RESTORE ${DB_NAME}" ]] || die "aborted"
fi

# 복원
echo "recreating target database..."
MYSQL_PWD="$DB_PASSWORD" docker exec -e MYSQL_PWD "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" \
    -e "DROP DATABASE IF EXISTS \`${TARGET_DB}\`; CREATE DATABASE \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "restoring... (크기에 따라 수 분 걸릴 수 있습니다)"
set +e
gunzip -c "$WORK_FILE" | MYSQL_PWD="$DB_PASSWORD" docker exec -i -e MYSQL_PWD "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" --default-character-set=utf8mb4 "$TARGET_DB"
PIPE_STATUSES=("${PIPESTATUS[@]}")
GUNZIP_STATUS="${PIPE_STATUSES[0]}"
RESTORE_STATUS="${PIPE_STATUSES[1]}"
set -e

[[ "$GUNZIP_STATUS" -eq 0 ]] || die "gunzip failed with status $GUNZIP_STATUS"
[[ "$RESTORE_STATUS" -eq 0 ]] || die "restore failed with status $RESTORE_STATUS"

# 복원 명령의 성공과 별개로 실제 테이블 수를 확인한다.
RESTORED_TABLES="$(MYSQL_PWD="$DB_PASSWORD" docker exec -e MYSQL_PWD "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" -N -B \
    -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${TARGET_DB}';")"

echo
echo "restore complete."
echo "  dump tables     : ${TABLE_COUNT}"
echo "  restored tables : ${RESTORED_TABLES}"

if [[ "$RESTORED_TABLES" -ne "$TABLE_COUNT" ]]; then
    echo "⚠️  테이블 수가 다릅니다. 복원이 부분적으로만 됐을 수 있으니 확인하세요." >&2
    exit 1
fi

echo
echo "다음 단계: 앱 컨테이너를 다시 띄우고 /actuator/health 와 실제 화면을 확인하세요."
