#!/usr/bin/env bash
#
# RESERVE MySQL 복원 — 백업 파일을 실제로 되돌린다.
#
#   reserve-restore /var/backups/reserve/reserve-20260731-030000.sql.gz
#   reserve-restore s3://reserve-it-kr-backup/mysql/reserve-20260731-030000.sql.gz
#   reserve-restore --list                     # 복원 가능한 백업 목록
#   reserve-restore --dry-run <file>           # 덤프 검증만 (DB 건드리지 않음)
#   reserve-restore --target reserve_restore_test <file>   # 별도 DB로 복원(복원 훈련용)
#
# ★ 백업은 "복원해본 적 있는 백업"만 백업이다.
#   한 번도 복원해보지 않은 백업은 대개 필요할 때 안 된다.
#   분기에 한 번은 --target 으로 별도 DB에 복원해서 테이블 수를 대조할 것.
#   절차는 docs/technical/backup.md 의 "복원 훈련" 참고.

set -euo pipefail

CONFIG_FILE="${RESERVE_BACKUP_ENV:-/etc/reserve-backup.env}"
if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
fi

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

# ─────────────────────────────────────────────────────────
# 인자 파싱
# ─────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────
# 백업 파일 준비
# ─────────────────────────────────────────────────────────
WORK_FILE=""
CLEANUP_WORK=0

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

cleanup() {
    if [[ "$CLEANUP_WORK" -eq 1 ]]; then
        rm -f "$WORK_FILE"
    fi
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────
# 검증 — 복원 전에 반드시. 깨진 덤프를 밀어넣으면 상황이 더 나빠진다.
# ─────────────────────────────────────────────────────────
echo "verifying dump..."
gzip -t "$WORK_FILE" || die "gzip integrity check failed"
gunzip -c "$WORK_FILE" | tail -5 | grep -q "Dump completed" \
    || die "dump is truncated (no 'Dump completed' marker)"

TABLE_COUNT="$(gunzip -c "$WORK_FILE" | grep -c '^CREATE TABLE' || true)"
DUMP_DATE="$(gunzip -c "$WORK_FILE" | grep -m1 -o 'Dump completed on .*' || echo 'unknown')"
echo "  tables : ${TABLE_COUNT}"
echo "  ${DUMP_DATE}"

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "dry-run: dump is valid. nothing was changed."
    exit 0
fi

# ─────────────────────────────────────────────────────────
# 확인 — 운영 DB를 덮어쓰는 경우 한 번 더 막는다
# ─────────────────────────────────────────────────────────
docker inspect "$MYSQL_CONTAINER" >/dev/null 2>&1 || die "container '$MYSQL_CONTAINER' not found"
[[ -n "${DB_PASSWORD:-}" ]] || die "DB_PASSWORD is not set (check $CONFIG_FILE)"

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

# ─────────────────────────────────────────────────────────
# 복원
# ─────────────────────────────────────────────────────────
echo "creating database if needed..."
docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" \
    -e "CREATE DATABASE IF NOT EXISTS \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "restoring... (크기에 따라 수 분 걸릴 수 있습니다)"
set +e
gunzip -c "$WORK_FILE" | docker exec -i -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" --default-character-set=utf8mb4 "$TARGET_DB"
RESTORE_STATUS="${PIPESTATUS[1]}"
set -e

[[ "$RESTORE_STATUS" -eq 0 ]] || die "restore failed with status $RESTORE_STATUS"

# ─────────────────────────────────────────────────────────
# 복원 후 대조 — "명령이 성공했다"와 "데이터가 들어갔다"는 다르다
# ─────────────────────────────────────────────────────────
RESTORED_TABLES="$(docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
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
