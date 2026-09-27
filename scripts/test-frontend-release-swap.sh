#!/usr/bin/env bash
# CI/local drill for staged frontend + backend routing cutover and rollback.

set -euo pipefail

DRILL_ROOT="$(mktemp -d)"
cleanup() { rm -rf "$DRILL_ROOT"; }
trap cleanup EXIT

RELEASE_ROOT="$DRILL_ROOT/releases"
OLD_RELEASE="1111111111111111111111111111111111111111"
NEW_RELEASE="2222222222222222222222222222222222222222"
DEPLOY_ATTEMPT="100-1"
ROLLBACK_DIR="$DRILL_ROOT/rollback-$NEW_RELEASE-$DEPLOY_ATTEMPT"
STALE_ROLLBACK_DIR="$DRILL_ROOT/rollback-$NEW_RELEASE-99-1"
NGINX_CONFIG="$DRILL_ROOT/default.conf"
SERVICE_ENV="$DRILL_ROOT/service-env.inc"
NGINX_TEMPLATE="$DRILL_ROOT/default-template.conf"

mkdir -p "$RELEASE_ROOT/$OLD_RELEASE" "$RELEASE_ROOT/$NEW_RELEASE"
printf 'old\n' > "$RELEASE_ROOT/$OLD_RELEASE/version.txt"
printf 'new\n' > "$RELEASE_ROOT/$NEW_RELEASE/version.txt"
printf '%s\n' "$NEW_RELEASE" > "$RELEASE_ROOT/$NEW_RELEASE/release-id.txt"

ln -sfn "releases/$OLD_RELEASE" "$DRILL_ROOT/current"
[[ "$(cat "$DRILL_ROOT/current/version.txt")" = "old" ]]

# Staging the new release and template must not change live frontend or backend routing.
printf 'root %s/current;\n' "$DRILL_ROOT" > "$NGINX_CONFIG"
printf 'set $service_url blue;\n' > "$SERVICE_ENV"
cp "$NGINX_CONFIG" "$NGINX_TEMPLATE"
[[ "$(readlink "$DRILL_ROOT/current")" = "releases/$OLD_RELEASE" ]]
grep -Fqx "set \$service_url blue;" "$SERVICE_ENV"

# Both containers can be healthy when best-effort cleanup previously failed. The nginx
# routing include, not health-check ordering, remains the authoritative live target.
BLUE_HEALTH=200
GREEN_HEALTH=200
SERVICE_ENV_LINE=$(tr -d '\r\n' < "$SERVICE_ENV")
case "$SERVICE_ENV_LINE" in
  'set $service_url blue;') CURRENT_UPSTREAM=blue ;;
  'set $service_url green;') CURRENT_UPSTREAM=green ;;
  *) echo "Invalid routing fixture"; exit 1 ;;
esac
[[ "$BLUE_HEALTH" = 200 && "$GREEN_HEALTH" = 200 ]]
[[ "$CURRENT_UPSTREAM" = blue ]]
TARGET_UPSTREAM=green
[[ "$TARGET_UPSTREAM" != "$CURRENT_UPSTREAM" ]]

# Preserve all three live routing inputs before cutover.
mkdir -p "$ROLLBACK_DIR"
readlink "$DRILL_ROOT/current" > "$ROLLBACK_DIR/previous-release"
cp "$NGINX_CONFIG" "$ROLLBACK_DIR/default.conf"
cp "$SERVICE_ENV" "$ROLLBACK_DIR/service-env.inc"

# A stale bundle for the same SHA but another workflow attempt must never be consumed.
mkdir -p "$STALE_ROLLBACK_DIR"
printf 'releases/9999999999999999999999999999999999999999\n' \
  > "$STALE_ROLLBACK_DIR/previous-release"

restore_routing() {
  cp "$ROLLBACK_DIR/default.conf" "$NGINX_CONFIG"
  cp "$ROLLBACK_DIR/service-env.inc" "$SERVICE_ENV"
  ln -sfn "$(cat "$ROLLBACK_DIR/previous-release")" "$DRILL_ROOT/current.next"
  mv -Tf "$DRILL_ROOT/current.next" "$DRILL_ROOT/current"
}

# Inject a failure after all three routing inputs changed. The same ERR trap used by
# production must restore the current attempt's bundle automatically.
set +e
(
  set -Eeuo pipefail
  rollback_cutover() {
    trap - ERR INT TERM HUP
    restore_routing
    exit 91
  }
  trap rollback_cutover ERR INT TERM HUP

  sed "s#root $DRILL_ROOT/current;#root $RELEASE_ROOT/$NEW_RELEASE;#" \
    "$NGINX_TEMPLATE" > "$NGINX_CONFIG"
  printf 'set $service_url green;\n' > "$SERVICE_ENV"
  ln -sfn "releases/$NEW_RELEASE" "$DRILL_ROOT/current.next"
  mv -Tf "$DRILL_ROOT/current.next" "$DRILL_ROOT/current"
  [[ "$(cat "$RELEASE_ROOT/$NEW_RELEASE/release-id.txt")" = "$NEW_RELEASE" ]]
  false # simulated nginx reload or post-deploy smoke failure
)
CUTOVER_STATUS=$?
set -e
[[ "$CUTOVER_STATUS" = 91 ]]

# The failed cutover restored frontend root, backend include, and compatibility pointer.
[[ "$(readlink "$DRILL_ROOT/current")" = "releases/$OLD_RELEASE" ]]
[[ "$(cat "$DRILL_ROOT/current/version.txt")" = "old" ]]
grep -Fqx "root $DRILL_ROOT/current;" "$NGINX_CONFIG"
grep -Fqx "set \$service_url blue;" "$SERVICE_ENV"
[[ -d "$RELEASE_ROOT/$NEW_RELEASE" ]]
[[ "$(cat "$STALE_ROLLBACK_DIR/previous-release")" = \
   "releases/9999999999999999999999999999999999999999" ]]

echo "Combined release cutover drill passed (routing source, attempt isolation, ERR rollback)."
