#!/usr/bin/env bash
#
# MySQL InnoDB의 payment 행 잠금을 두 세션으로 실기 확인한다.
# 두 트랜잭션 모두 ROLLBACK하며 값을 수정하지 않지만, 첫 세션이 5초 동안 지정 행을
# 잠그므로 운영 트래픽이 없는 TEST 결제 ID에서만 승인된 점검 창에 실행한다.

set -euo pipefail

CONFIG_FILE="${RESERVE_VERIFY_ENV:-/etc/reserve-backup.env}"
if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
fi

MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
DB_NAME="${DB_NAME:-reserve}"
DB_USER="${DB_USER:-root}"
PAYMENT_ID="${1:-}"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ "$PAYMENT_ID" =~ ^[1-9][0-9]*$ ]] || die "usage: $0 <test-payment-id>"
[[ -n "${DB_PASSWORD:-}" ]] || die "DB_PASSWORD is not set (check $CONFIG_FILE)"
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || die "DB_NAME contains unsupported characters"
[[ "$DB_USER" =~ ^[A-Za-z0-9_]+$ ]] || die "DB_USER contains unsupported characters"

docker inspect "$MYSQL_CONTAINER" >/dev/null 2>&1 \
    || die "container '$MYSQL_CONTAINER' not found"

ROW_COUNT="$(docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" --batch --skip-column-names "$DB_NAME" \
    -e "SELECT COUNT(*) FROM payment WHERE payment_id = ${PAYMENT_ID};")"
[[ "$ROW_COUNT" = "1" ]] || die "payment ${PAYMENT_ID} does not exist"

echo "This will hold payment ${PAYMENT_ID} with SELECT ... FOR UPDATE for about 5 seconds."
printf "Continue only for an idle TEST payment. Type 'LOCK %s': " "$PAYMENT_ID"
read -r CONFIRM
[[ "$CONFIRM" = "LOCK ${PAYMENT_ID}" ]] || die "aborted"

FIRST_OUTPUT="$(mktemp)"
SECOND_OUTPUT="$(mktemp)"
FIRST_PID=""
cleanup() {
    if [[ -n "$FIRST_PID" ]] && kill -0 "$FIRST_PID" 2>/dev/null; then
        wait "$FIRST_PID" || true
    fi
    rm -f "$FIRST_OUTPUT" "$SECOND_OUTPUT"
}
trap cleanup EXIT

docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" "$DB_NAME" \
    -e "START TRANSACTION; SELECT payment_id FROM payment WHERE payment_id = ${PAYMENT_ID} FOR UPDATE; DO SLEEP(5); ROLLBACK;" \
    >"$FIRST_OUTPUT" 2>&1 &
FIRST_PID=$!

sleep 1
set +e
docker exec -e MYSQL_PWD="$DB_PASSWORD" "$MYSQL_CONTAINER" \
    mysql --user="$DB_USER" "$DB_NAME" \
    -e "SET SESSION innodb_lock_wait_timeout = 2; START TRANSACTION; SELECT payment_id FROM payment WHERE payment_id = ${PAYMENT_ID} FOR UPDATE; ROLLBACK;" \
    >"$SECOND_OUTPUT" 2>&1
SECOND_STATUS=$?
set -e

wait "$FIRST_PID"
FIRST_PID=""

if [[ "$SECOND_STATUS" -eq 0 ]]; then
    cat "$SECOND_OUTPUT" >&2
    die "second session was not blocked by the first FOR UPDATE"
fi

if ! grep -q "Lock wait timeout exceeded" "$SECOND_OUTPUT"; then
    cat "$SECOND_OUTPUT" >&2
    die "second session failed for an unexpected reason"
fi

echo "PASS: the second transaction timed out behind the first row lock; both transactions rolled back."
