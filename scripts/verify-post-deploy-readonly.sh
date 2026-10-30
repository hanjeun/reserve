#!/usr/bin/env bash
# 운영 큐와 스키마만 조회하며 실제 결제·재처리·삭제·보정은 수행하지 않는다.
# 해당 DDL 준비 후 WAITING_SIGNUP·AUTH_ADMISSION·V11 스키마 검사를 명시적으로 선택한다.
# 추가 SQL 검사는 실제 릴리스 JAR의 Hibernate validate를 대체하지 않는다.

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
AUTH_ADMISSION_SCHEMA="${RESERVE_VERIFY_AUTH_ADMISSION_SCHEMA:-0}"
[[ "$AUTH_ADMISSION_SCHEMA" = "0" || "$AUTH_ADMISSION_SCHEMA" = "1" ]] \
    || die "RESERVE_VERIFY_AUTH_ADMISSION_SCHEMA must be 0 or 1"
V11_SCHEMA="${RESERVE_VERIFY_V11_SCHEMA:-0}"
[[ "$V11_SCHEMA" = "0" || "$V11_SCHEMA" = "1" ]] \
    || die "RESERVE_VERIFY_V11_SCHEMA must be 0 or 1"
if [[ "$AUTH_ADMISSION_SCHEMA" = "1" || "$V11_SCHEMA" = "1" ]]; then
    [[ "$DB_USER" = "reserve_backup" ]] || die "auth/admission checks require the configured backup role"
fi

docker inspect "$MYSQL_CONTAINER" >/dev/null 2>&1 \
    || die "container '$MYSQL_CONTAINER' not found"
[[ "$(docker inspect -f '{{.State.Running}}' "$MYSQL_CONTAINER")" = "true" ]] \
    || die "container '$MYSQL_CONTAINER' is not running"

mysql_query() {
    local query=$1
    if [[ "$AUTH_ADMISSION_SCHEMA" = "1" || "$V11_SCHEMA" = "1" ]]; then
        query="START TRANSACTION READ ONLY; ${query} ROLLBACK;"
    fi
    MYSQL_PWD="$DB_PASSWORD" docker exec -e MYSQL_PWD "$MYSQL_CONTAINER" \
        mysql --connect-timeout=5 --user="$DB_USER" --batch --skip-column-names "$DB_NAME" -e "$query"
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
    local expected_extra="${6:-}" escaped_type="${3//\'/\'\'}"
    local default_condition="COLUMN_DEFAULT IS NULL"
    if [[ "$default" != "<NULL>" ]]; then
        default_condition="BINARY COLUMN_DEFAULT = BINARY '${default//\'/\'\'}'"
    fi
    local count
    count="$(mysql_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}' AND BINARY column_type = BINARY '${escaped_type}' AND is_nullable = '${nullable}' AND ${default_condition} AND extra = '${expected_extra}';")"
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
    # MySQL의 문자셋 접두사·따옴표 이스케이프는 허용하되 추가 조건과 비활성 CHECK는 거부한다.
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

require_foreign_key_contract() {
    local table="$1" constraint="$2" column="$3" referenced_table="$4" referenced_column="$5" deletion="$6"
    local delete_condition="rc.delete_rule IN ('NO ACTION','RESTRICT')" matches
    if [[ "$deletion" = "CASCADE" ]]; then delete_condition="rc.delete_rule = 'CASCADE'"; fi
    matches="$(mysql_query "SELECT IF(COUNT(*) = 1 AND SUM(k.column_name = '${column}' AND k.ordinal_position = 1 AND k.referenced_table_schema = DATABASE() AND k.referenced_table_name = '${referenced_table}' AND k.referenced_column_name = '${referenced_column}' AND ${delete_condition} AND rc.update_rule IN ('NO ACTION','RESTRICT')) = 1, 1, 0) FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints rc ON rc.constraint_schema = k.constraint_schema AND rc.table_name = k.table_name AND rc.constraint_name = k.constraint_name WHERE k.table_schema = DATABASE() AND k.table_name = '${table}' AND k.constraint_name = '${constraint}';")"
    [[ "$matches" = "1" ]] || die "foreign key contract differs: ${table}.${constraint}"
    note "foreign key ${table}.${constraint}: contract matches"
}

ATTENTION=0

note "schema=${DB_NAME}, container=${MYSQL_CONTAINER}"

if [[ "$AUTH_ADMISSION_SCHEMA" = "1" || "$V11_SCHEMA" = "1" ]]; then
    AUTHENTICATED_BACKUP_ROLE="$(mysql_query "SELECT IF(SUBSTRING_INDEX(CURRENT_USER(),'@',1) = 'reserve_backup', 1, 0);")"
    [[ "$AUTHENTICATED_BACKUP_ROLE" = "1" ]] || die "authenticated backup role differs; refusing auth/admission checks"
fi

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

# 해당 후보를 배포한 경우에만 추가 스키마를 요구한다.
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
    # health 응답만으로 드러나지 않는 사장님 발신자 ENUM 계약을 확인한다.
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

if [[ "$AUTH_ADMISSION_SCHEMA" = "1" ]]; then
    AUTH_ADMISSION_INNODB="$(mysql_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('member','reservation','login_method_challenge','login_session','reservation_request') AND table_type = 'BASE TABLE' AND engine = 'InnoDB';")"
    [[ "$AUTH_ADMISSION_INNODB" = "5" ]] || die "auth/admission tables must exist and use InnoDB"
    require_column_contract member login_methods_managed 'tinyint(1)' NO 0

    require_column_contract login_method_challenge id 'varchar(36)' NO '<NULL>'
    require_column_contract login_method_challenge member_id bigint NO '<NULL>'
    require_column_contract login_method_challenge auth_version int NO '<NULL>'
    require_column_contract login_method_challenge purpose "enum('PASSWORD_SETUP','SOCIAL_LINK','SOCIAL_REAUTH')" NO '<NULL>'
    require_column_contract login_method_challenge provider "enum('GOOGLE','KAKAO','LOCAL','NAVER')" YES '<NULL>'
    require_column_contract login_method_challenge email 'varchar(255)' YES '<NULL>'
    require_column_contract login_method_challenge code_hash 'varchar(100)' YES '<NULL>'
    require_column_contract login_method_challenge created_at 'datetime(6)' NO '<NULL>'
    require_column_contract login_method_challenge expires_at 'datetime(6)' NO '<NULL>'
    require_column_contract login_method_challenge attempt_count int NO 0
    require_column_contract login_method_challenge consumed 'tinyint(1)' NO 0
    require_index_contract login_method_challenge PRIMARY 0 id
    require_index_contract login_method_challenge uk_login_method_member_purpose 0 'member_id,purpose'
    require_index_contract login_method_challenge idx_login_method_expiry 1 expires_at
    require_foreign_key_contract login_method_challenge fk_login_method_member member_id member member_id RESTRICT

    require_column_contract login_session id bigint NO '<NULL>' auto_increment
    require_column_contract login_session member_id bigint NO '<NULL>'
    require_column_contract login_session session_id 'varchar(36)' NO '<NULL>'
    require_column_contract login_session refresh_token_hash 'varchar(64)' NO '<NULL>'
    require_column_contract login_session previous_token_hash 'varchar(64)' YES '<NULL>'
    require_column_contract login_session rotation_version bigint NO '<NULL>'
    require_column_contract login_session refresh_jti 'varchar(36)' NO '<NULL>'
    require_column_contract login_session signing_key_id 'varchar(48)' YES '<NULL>'
    for column in created_at issued_at expires_at absolute_expires_at; do
        require_column_contract login_session "$column" 'datetime(6)' NO '<NULL>'
    done
    for column in rotated_at oauth_authenticated_at; do
        require_column_contract login_session "$column" 'datetime(6)' YES '<NULL>'
    done
    require_column_contract login_session auth_version int NO '<NULL>'
    require_column_contract login_session login_method 'varchar(16)' NO '<NULL>'
    require_index_contract login_session PRIMARY 0 id
    require_index_contract login_session uk_login_session_sid 0 session_id
    require_index_contract login_session uk_login_session_hash 0 refresh_token_hash
    require_index_contract login_session idx_login_session_member 1 member_id
    require_index_contract login_session idx_login_session_expiry 1 expires_at

    require_column_contract reservation_request request_id bigint NO '<NULL>' auto_increment
    require_column_contract reservation_request member_id bigint NO '<NULL>'
    require_column_contract reservation_request request_key 'varchar(36)' NO '<NULL>'
    require_column_contract reservation_request request_hash 'varchar(64)' NO '<NULL>'
    require_column_contract reservation_request reservation_id bigint NO '<NULL>'
    require_column_contract reservation_request created_at 'datetime(6)' NO '<NULL>'
    REQUEST_ASCII_COLUMNS="$(mysql_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reservation_request' AND column_name IN ('request_key','request_hash') AND character_set_name = 'ascii' AND collation_name = 'ascii_bin';")"
    [[ "$REQUEST_ASCII_COLUMNS" = "2" ]] || die "reservation request keys/hashes require ascii_bin comparison"
    require_index_contract reservation_request PRIMARY 0 request_id
    require_index_contract reservation_request uk_reservation_request_member_key 0 'member_id,request_key'
    require_foreign_key_contract reservation_request fk_reservation_request_member member_id member member_id CASCADE
    require_foreign_key_contract reservation_request fk_reservation_request_reservation reservation_id reservation reservation_id CASCADE
    note "auth/admission schema: contract matches; actual release JAR validation is still required"
fi

if [[ "$V11_SCHEMA" = "1" ]]; then
    V11_INNODB="$(mysql_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('mfa_account','mfa_credential','mfa_challenge','mfa_recovery_code','test_settlement_payout','reservation_consent','reservation_retention_hold') AND table_type = 'BASE TABLE' AND engine = 'InnoDB';")"
    [[ "$V11_INNODB" = "7" ]] || die "v11 tables must exist and use InnoDB"
    V11_ASCII="$(mysql_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND character_set_name = 'ascii' AND collation_name = 'ascii_bin' AND ((table_name = 'mfa_credential' AND column_name IN ('slot_key','credential_id','public_key_cose')) OR (table_name = 'mfa_challenge' AND column_name = 'id') OR (table_name = 'mfa_recovery_code' AND column_name = 'digest') OR (table_name = 'test_settlement_payout' AND column_name = 'request_key')); ")"
    [[ "$V11_ASCII" = "6" ]] || die "v11 credential and request identifiers require ascii_bin comparison"
    require_column_contract mfa_credential secret_ciphertext 'varchar(512)' YES '<NULL>'
    require_column_contract mfa_credential credential_id 'varchar(2048)' YES '<NULL>'
    require_column_contract mfa_credential public_key_cose 'varchar(4096)' YES '<NULL>'
    require_column_contract mfa_challenge consumed_at 'datetime(6)' YES '<NULL>'
    require_index_contract mfa_account uk_mfa_account_handle 0 user_handle
    require_index_contract mfa_credential uk_mfa_credential_slot 0 slot_key
    require_index_contract mfa_credential idx_mfa_credential_member 1 member_id
    require_index_contract mfa_challenge idx_mfa_challenge_expiry 1 expires_at
    require_index_contract mfa_recovery_code PRIMARY 0 digest
    require_index_contract test_settlement_payout PRIMARY 0 request_key
    require_index_contract test_settlement_payout idx_test_settlement_payment 1 payment_id
    require_column_contract store auto_completion_enabled 'tinyint(1)' NO 0
    require_column_contract store service_duration_minutes int NO 60
    require_column_contract reservation auto_completion_enabled 'tinyint(1)' NO 0
    require_column_contract reservation attendance_refund_enabled 'tinyint(1)' NO 0
    require_column_contract reservation service_duration_minutes int YES '<NULL>'
    require_column_contract reservation usage_ends_at 'datetime(6)' YES '<NULL>'
    require_index_contract reservation idx_reservation_auto_completion 1 'auto_completion_enabled,status,usage_ends_at'
    require_column_contract payment verified_channel_type 'varchar(16)' YES '<NULL>'
    require_column_contract payment verified_channel_id 'varchar(80)' YES '<NULL>'
    require_column_contract payment verified_store_id 'varchar(80)' YES '<NULL>'
    require_column_contract payment verified_disputed 'tinyint(1)' YES '<NULL>'

    # JDBC 전용 표도 타입·보존 연결까지 확인하며 JPA validate로 대신하지 않는다.
    for column in reservation_id member_id store_id recipient_id; do
        require_column_contract reservation_consent "$column" bigint NO '<NULL>'
    done
    require_column_contract reservation_consent notice_version 'varchar(32)' NO '<NULL>'
    require_column_contract reservation_consent notice_hash 'char(64)' NO '<NULL>'
    require_column_contract reservation_consent notice_snapshot longtext NO '<NULL>'
    require_column_contract reservation_consent privacy_accepted 'tinyint(1)' NO '<NULL>'
    require_column_contract reservation_consent conditions_accepted 'tinyint(1)' NO '<NULL>'
    for column in accepted_at expires_at; do
        require_column_contract reservation_consent "$column" 'datetime(6)' NO '<NULL>'
    done
    require_index_contract reservation_consent PRIMARY 0 reservation_id
    require_index_contract reservation_consent idx_reservation_consent_expiry 1 expires_at
    require_foreign_key_contract reservation_consent fk_reservation_consent_reservation reservation_id reservation reservation_id RESTRICT
    require_column_contract reservation_retention_hold retention_hold_id bigint NO '<NULL>' auto_increment
    for column in reservation_id held_by; do
        require_column_contract reservation_retention_hold "$column" bigint NO '<NULL>'
    done
    require_column_contract reservation_retention_hold case_reference 'varchar(80)' NO '<NULL>'
    require_column_contract reservation_retention_hold purpose 'varchar(32)' NO '<NULL>'
    require_column_contract reservation_retention_hold held_at 'datetime(6)' NO '<NULL>'
    require_column_contract reservation_retention_hold released_by bigint YES '<NULL>'
    require_column_contract reservation_retention_hold released_at 'datetime(6)' YES '<NULL>'
    require_index_contract reservation_retention_hold PRIMARY 0 retention_hold_id
    require_index_contract reservation_retention_hold idx_reservation_retention_hold 1 'reservation_id,released_at'
    require_foreign_key_contract reservation_retention_hold fk_reservation_retention_hold reservation_id reservation reservation_id RESTRICT
    note "v11/JDBC schema: contract matches; actual release JAR validation and restricted app grants are still required"
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
