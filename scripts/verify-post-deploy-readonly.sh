#!/usr/bin/env bash
#
# RESERVE 배포 후 DB 구조와 운영 큐를 읽기 전용으로 점검한다.
#
#   sudo RESERVE_VERIFY_ENV=/etc/reserve-backup.env \
#     /usr/local/bin/reserve-post-deploy-verify
#   DDL 11/12/13 후보 적용 후에만 RESERVE_VERIFY_WAITING_SIGNUP_SCHEMA=1을 추가한다.
#
# 이 스크립트는 테이블·컬럼·인덱스와 현재 큐 상태만 조회한다. PortOne 재조회,
# 웹훅 재처리, S3 객체 삭제, READY 결제 상태 변경은 의도적으로 하지 않는다.

set -euo pipefail

CONFIG_FILE="${RESERVE_VERIFY_ENV:-/etc/reserve-backup.env}"
if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
fi

MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
DB_NAME="${DB_NAME:-reserve}"
DB_USER="${DB_USER:-root}"
STALE_READY_DAYS="${STALE_READY_DAYS:-7}"

die() { echo "ERROR: $*" >&2; exit 1; }
note() { echo "[check] $*"; }
warn() { echo "[attention] $*" >&2; ATTENTION=1; }

[[ -n "${DB_PASSWORD:-}" ]] || die "DB_PASSWORD is not set (check $CONFIG_FILE)"
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || die "DB_NAME contains unsupported characters"
[[ "$DB_USER" =~ ^[A-Za-z0-9_]+$ ]] || die "DB_USER contains unsupported characters"
[[ "$STALE_READY_DAYS" =~ ^[1-9][0-9]*$ ]] || die "STALE_READY_DAYS must be a positive integer"
WAITING_SIGNUP_SCHEMA="${RESERVE_VERIFY_WAITING_SIGNUP_SCHEMA:-0}"
[[ "$WAITING_SIGNUP_SCHEMA" = "0" || "$WAITING_SIGNUP_SCHEMA" = "1" ]] \
    || die "RESERVE_VERIFY_WAITING_SIGNUP_SCHEMA must be 0 or 1"

docker inspect "$MYSQL_CONTAINER" >/dev/null 2>&1 \
    || die "container '$MYSQL_CONTAINER' not found"
[[ "$(docker inspect -f '{{.State.Running}}' "$MYSQL_CONTAINER")" = "true" ]] \
    || die "container '$MYSQL_CONTAINER' is not running"

mysql_query() {
    local query=$1
    docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
        mysql --user="$DB_USER" --batch --skip-column-names "$DB_NAME" -e "$query"
}

require_table() {
    local table="$1"
    local count
    count="$(mysql_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${table}';")"
    [[ "$count" = "1" ]] || die "required table is missing: $table"
    note "table $table: present"
}

require_column() {
    local table="$1"
    local column="$2"
    local count
    count="$(mysql_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}';")"
    [[ "$count" = "1" ]] || die "required column is missing: ${table}.${column}"
    note "column ${table}.${column}: present"
}

require_index() {
    local table="$1"
    local index="$2"
    local count
    count="$(mysql_query "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = '${table}' AND index_name = '${index}';")"
    [[ "$count" = "1" ]] || die "required index is missing: ${table}.${index}"
    note "index ${table}.${index}: present"
}

require_column_contract() {
    local table="$1" column="$2" type="$3" nullable="$4" default="$5"
    local default_condition="COLUMN_DEFAULT IS NULL"
    if [[ "$default" != "<NULL>" ]]; then
        default_condition="BINARY COLUMN_DEFAULT = BINARY '${default//\'/\'\'}'"
    fi
    local count
    count="$(mysql_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}' AND LOWER(column_type) = '${type}' AND is_nullable = '${nullable}' AND ${default_condition} AND extra = '';")"
    [[ "$count" = "1" ]] || die "column contract differs: ${table}.${column} (type/null/default/extra)"
    note "column ${table}.${column}: contract matches"
}

require_index_contract() {
    local table="$1" index="$2" non_unique="$3" expected_columns="$4"
    local columns=()
    IFS=',' read -r -a columns <<< "$expected_columns"
    local matches
    matches="$(mysql_query "SELECT IF(COUNT(*) = ${#columns[@]} AND SUM(non_unique = ${non_unique} AND sub_part IS NULL AND column_name IS NOT NULL AND expression IS NULL AND index_type = 'BTREE' AND is_visible = 'YES' AND collation = 'A') = ${#columns[@]} AND BINARY GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') = BINARY '${expected_columns}', 1, 0) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = '${table}' AND index_name = '${index}';")"
    [[ "$matches" = "1" ]] || die "index contract differs: ${table}.${index} (columns/order/unique/prefix/visibility)"
    note "index ${table}.${index}: contract matches"
}

require_enum_check() {
    local table="$1" constraint="$2" column="$3"
    shift 3
    # MySQL emits charset introducers and, on some servers, escaped literal quotes.
    # Match only the declared IN list; additional expressions and NOT ENFORCED fail.
    local quote="[\\\\]?'" charset="(_utf8mb4|_utf8mb3|_utf8|_latin1|_ascii|_binary)?"
    local pattern="^[[:space:]]*[(]*[[:space:]]*\`?${column}\`?[[:space:]]+[iI][nN][[:space:]]*[(][[:space:]]*"
    local separator="" value
    for value in "$@"; do
        pattern+="${separator}${charset}${quote}${value}${quote}"
        separator="[[:space:]]*,[[:space:]]*"
    done
    pattern+="[[:space:]]*[)][[:space:]]*[)]*[[:space:]]*$"
    local pattern_hex count
    pattern_hex="$(printf '%s' "$pattern" | od -An -v -tx1 | tr -d ' \n')"
    count="$(mysql_query "SELECT COUNT(*) FROM information_schema.table_constraints tc JOIN information_schema.check_constraints cc ON cc.constraint_schema = tc.constraint_schema AND cc.constraint_name = tc.constraint_name WHERE tc.table_schema = DATABASE() AND tc.table_name = '${table}' AND tc.constraint_name = '${constraint}' AND tc.constraint_type = 'CHECK' AND tc.enforced = 'YES' AND REGEXP_LIKE(cc.check_clause, CONVERT(0x${pattern_hex} USING utf8mb4), 'c');")"
    [[ "$count" = "1" ]] || die "CHECK contract differs or is not enforced: ${table}.${constraint}"
    note "CHECK ${table}.${constraint}: enforced contract matches"
}

ATTENTION=0

note "schema=${DB_NAME}, container=${MYSQL_CONTAINER}"

for table in payment_webhook_inbox payment_reconciliation_issue file_deletion_task oauth_unlink_task marketing_consent_history; do
    require_table "$table"
done
require_column reservation checked_in_at
require_column member auth_version
require_column oauth_unlink_task lease_id
require_column refresh_token previous_token_hash
require_column refresh_token rotated_at

require_index payment_webhook_inbox uk_payment_webhook_inbox_webhook_id
require_index payment_webhook_inbox idx_payment_webhook_inbox_retry
require_index payment_webhook_inbox idx_payment_webhook_inbox_merchant_uid
require_index payment_reconciliation_issue uk_payment_reconciliation_issue_key
require_index payment_reconciliation_issue idx_payment_reconciliation_issue_status
require_index file_deletion_task uk_file_deletion_target_hash
require_index file_deletion_task idx_file_deletion_retry
require_index oauth_unlink_task uk_oauth_unlink_task_key
require_index oauth_unlink_task idx_oauth_unlink_retry
require_index marketing_consent_history idx_marketing_consent_member_created
require_index refresh_token idx_refresh_token_previous_hash

# 기존 운영 점검은 그대로 유지한다. 승인된 프리뷰 후보가 배포된 뒤에만 추가 구조를 요구한다.
if [[ "${RESERVE_VERIFY_PREVIEW_SCHEMA:-0}" = "1" ]]; then
    for table in ad_payment_attempt chat_room chat_message chat_report chat_intro chat_intro_item; do
        require_table "$table"
    done
    for column in image_key image_content_type image_width image_height image_bytes sender_member_id client_message_id; do
        require_column chat_message "$column"
    done
    for column in store_id store_name_snapshot owner_unread last_message_preview member_blocked_at owner_blocked_at; do
        require_column chat_room "$column"
    done
    require_index chat_message uk_chat_message_idempotency
    require_index chat_message idx_chat_message_room
    require_index chat_room idx_chat_room_store_type
    require_index chat_report uk_chat_report_key
    require_index chat_intro uk_chat_intro_scope
    # 기존 MySQL ENUM에 OWNER가 없으면 health는 200이어도 사장님 첫 답장이 실패한다.
    CHAT_SENDER_TYPE="$(mysql_query "SELECT column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'chat_message' AND column_name = 'sender_role';")"
    if [[ "$CHAT_SENDER_TYPE" == enum\(* ]]; then
        [[ "$CHAT_SENDER_TYPE" == *"'ADMIN'"* && "$CHAT_SENDER_TYPE" == *"'MEMBER'"* && "$CHAT_SENDER_TYPE" == *"'OWNER'"* ]] \
            || die "chat_message.sender_role ENUM must include ADMIN, MEMBER and OWNER; approve manual DDL before cutover"
    elif [[ "$CHAT_SENDER_TYPE" =~ ^(var)?char\(([0-9]+)\)$ ]]; then
        [[ "${BASH_REMATCH[2]}" -ge 6 ]] || die "chat_message.sender_role text column is too short"
    else
        die "unexpected chat_message.sender_role type: $CHAT_SENDER_TYPE"
    fi
    note "chat_message.sender_role: owner replies supported"
    PREVIEW_NON_INNODB="$(mysql_query "SELECT CONCAT(table_name, ':', engine) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('ad_payment_attempt','chat_room','chat_message','chat_report','chat_intro','chat_intro_item') AND engine <> 'InnoDB';")"
    [[ -z "$PREVIEW_NON_INNODB" ]] || die "preview row-lock tables must use InnoDB: $PREVIEW_NON_INNODB"
    note "preview advertising/chat tables: InnoDB"
fi

if [[ "$WAITING_SIGNUP_SCHEMA" = "1" ]]; then
    for table in store waiting_entry email_verification member; do
        require_table "$table"
    done
    WAITING_SIGNUP_INNODB="$(mysql_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('store','waiting_entry','email_verification','member') AND table_type = 'BASE TABLE' AND engine = 'InnoDB';")"
    [[ "$WAITING_SIGNUP_INNODB" = "4" ]] || die "waiting/signup lock tables must use InnoDB"

    require_column_contract store waiting_intake_mode 'varchar(16)' NO OFF
    require_column_contract store waiting_paused 'bit(1)' NO "b'0'"
    require_column_contract store reservation_enabled 'bit(1)' NO "b'1'"
    require_column_contract waiting_entry member_id bigint YES '<NULL>'
    require_column_contract waiting_entry source 'varchar(16)' NO STAFF
    require_column_contract waiting_entry privacy_notice_published_at 'datetime(6)' YES '<NULL>'
    require_enum_check store chk_store_waiting_intake waiting_intake_mode OFF ONSITE REMOTE BOTH
    require_enum_check waiting_entry chk_waiting_source source STAFF ONSITE REMOTE
    require_index_contract waiting_entry idx_waiting_member 1 'member_id,status,created_at'

    require_column_contract email_verification email 'varchar(255)' NO '<NULL>'
    require_column_contract email_verification verification_ticket_hash 'varchar(64)' YES '<NULL>'
    EMAIL_UNIQUE_CONSTRAINT="$(mysql_query "SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'email_verification' AND constraint_name = 'uk_email_verification_email' AND constraint_type = 'UNIQUE';")"
    [[ "$EMAIL_UNIQUE_CONSTRAINT" = "1" ]] || die "email verification UNIQUE constraint is missing"
    require_index_contract email_verification uk_email_verification_email 0 email
    EMAIL_DUPLICATE_GROUPS="$(mysql_query "SELECT COUNT(*) FROM (SELECT email FROM email_verification GROUP BY email HAVING COUNT(*) > 1) duplicate_emails;")"
    [[ "$EMAIL_DUPLICATE_GROUPS" = "0" ]] || die "duplicate email verification groups require approved review"
    note "DDL 11/12/13 waiting/signup schema: contract matches"
fi

NON_INNODB="$(mysql_query "SELECT CONCAT(table_name, ':', engine) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('payment','reservation','payment_webhook_inbox','payment_reconciliation_issue','file_deletion_task','oauth_unlink_task','marketing_consent_history','refresh_token') AND engine <> 'InnoDB';")"
if [[ -n "$NON_INNODB" ]]; then
    die "row-lock tables must use InnoDB: $NON_INNODB"
fi
note "payment/lifecycle tables: InnoDB"

STALE_READY="$(mysql_query "SELECT COUNT(*) FROM payment WHERE status = 'READY' AND created_at < NOW() - INTERVAL ${STALE_READY_DAYS} DAY;")"
OPEN_ISSUES="$(mysql_query "SELECT COUNT(*) FROM payment_reconciliation_issue WHERE status = 'OPEN';")"
UNFINISHED_WEBHOOKS="$(mysql_query "SELECT COUNT(*) FROM payment_webhook_inbox WHERE status IN ('RECEIVED','PROCESSING','FAILED');")"
FAILED_DELETIONS="$(mysql_query "SELECT COUNT(*) FROM file_deletion_task WHERE status = 'FAILED';")"
PENDING_DELETIONS="$(mysql_query "SELECT COUNT(*) FROM file_deletion_task WHERE status = 'PENDING';")"
UNRESOLVED_OAUTH_UNLINKS="$(mysql_query "SELECT COUNT(*) FROM oauth_unlink_task WHERE status IN ('FAILED','BLOCKED') OR (status = 'PROCESSING' AND next_attempt_at <= NOW());")"
LEDGER_INVARIANTS="$(mysql_query "SELECT COUNT(*) FROM payment WHERE amount IS NULL OR amount <= 0 OR COALESCE(refund_amount, 0) < 0 OR COALESCE(refund_amount, 0) > amount OR (status IN ('PAID','PARTIAL_REFUNDED','REFUND_PENDING','REFUNDED') AND paid_at IS NULL) OR (status IN ('READY','FAILED','CANCELLED') AND (paid_at IS NOT NULL OR COALESCE(refund_amount, 0) <> 0)) OR (status = 'PAID' AND COALESCE(refund_amount, 0) <> 0) OR (status = 'PARTIAL_REFUNDED' AND (COALESCE(refund_amount, 0) <= 0 OR refund_amount >= amount)) OR (status = 'REFUNDED' AND COALESCE(refund_amount, 0) < amount);")"
DEPOSIT_INVARIANTS="$(mysql_query "SELECT COUNT(*) FROM reservation r WHERE (r.deposit_paid = TRUE AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = r.reservation_id AND p.paid_at IS NOT NULL AND p.status IN ('PAID','PARTIAL_REFUNDED','REFUND_PENDING','REFUNDED') AND p.amount - COALESCE(p.refund_amount, 0) > 0)) OR ((r.deposit_paid = FALSE OR r.deposit_paid IS NULL) AND EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = r.reservation_id AND p.paid_at IS NOT NULL AND p.status IN ('PAID','PARTIAL_REFUNDED','REFUND_PENDING','REFUNDED') AND p.amount - COALESCE(p.refund_amount, 0) > 0));")"
CHECKED_IN="$(mysql_query "SELECT COUNT(*) FROM reservation WHERE checked_in_at IS NOT NULL;")"

note "checked-in reservations: ${CHECKED_IN}"
note "stale READY payments (> ${STALE_READY_DAYS}d): ${STALE_READY}"
note "open payment reconciliation issues: ${OPEN_ISSUES}"
note "unfinished PortOne webhooks: ${UNFINISHED_WEBHOOKS}"
note "file deletion outbox: pending=${PENDING_DELETIONS}, failed=${FAILED_DELETIONS}"
note "OAuth unlink outbox: unresolved=${UNRESOLVED_OAUTH_UNLINKS}"
note "payment invariants: ledger=${LEDGER_INVARIANTS}, reservation-deposit=${DEPOSIT_INVARIANTS}"

if [[ "$STALE_READY" -gt 0 ]]; then
    warn "stale READY payments require PortOne-console comparison before any reconciliation"
    mysql_query "SELECT payment_id, reservation_id, TIMESTAMPDIFF(DAY, created_at, NOW()) AS age_days FROM payment WHERE status = 'READY' AND created_at < NOW() - INTERVAL ${STALE_READY_DAYS} DAY ORDER BY created_at ASC LIMIT 50;"
fi
[[ "$OPEN_ISSUES" -eq 0 ]] || warn "payment reconciliation queue is not empty"
[[ "$UNFINISHED_WEBHOOKS" -eq 0 ]] || warn "PortOne webhook inbox has unfinished work"
[[ "$FAILED_DELETIONS" -eq 0 ]] || warn "S3 deletion outbox has failed work"
[[ "$UNRESOLVED_OAUTH_UNLINKS" -eq 0 ]] || warn "OAuth unlink outbox has failed or blocked work"
[[ "$LEDGER_INVARIANTS" -eq 0 ]] || warn "payment ledger invariants require review; do not auto-correct"
[[ "$DEPOSIT_INVARIANTS" -eq 0 ]] || warn "reservation deposit flags disagree with payment net balances; do not auto-correct"

echo
if [[ "$ATTENTION" -eq 0 ]]; then
    echo "PASS: required schema is present and no attention queue is open."
    exit 0
fi

echo "ATTENTION: schema checks passed, but an operator queue needs review. No data was changed."
exit 2
