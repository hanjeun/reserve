#!/usr/bin/env bash
# 격리된 파일로 프론트·백엔드 경로의 동시 전환과 복구를 검사한다.

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

# 준비 단계는 현재 프론트·백엔드 경로를 바꾸지 않아야 한다.
printf 'root %s/current;\n' "$DRILL_ROOT" > "$NGINX_CONFIG"
printf 'set $service_url blue;\n' > "$SERVICE_ENV"
cp "$NGINX_CONFIG" "$NGINX_TEMPLATE"
[[ "$(readlink "$DRILL_ROOT/current")" = "releases/$OLD_RELEASE" ]]
grep -Fqx "set \$service_url blue;" "$SERVICE_ENV"

# 양쪽 앱이 정상이더라도 실제 연결 대상은 nginx의 경로 설정으로 판단한다.
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

# 전환 전에 설정 두 파일과 프론트 포인터를 함께 보존한다.
mkdir -p "$ROLLBACK_DIR"
readlink "$DRILL_ROOT/current" > "$ROLLBACK_DIR/previous-release"
cp "$NGINX_CONFIG" "$ROLLBACK_DIR/default.conf"
cp "$SERVICE_ENV" "$ROLLBACK_DIR/service-env.inc"

# 같은 SHA라도 다른 실행 시도의 복구 묶음을 사용하지 않는다.
mkdir -p "$STALE_ROLLBACK_DIR"
printf 'releases/9999999999999999999999999999999999999999\n' \
  > "$STALE_ROLLBACK_DIR/previous-release"

restore_routing() {
  cp "$ROLLBACK_DIR/default.conf" "$NGINX_CONFIG"
  cp "$ROLLBACK_DIR/service-env.inc" "$SERVICE_ENV"
  ln -sfn "$(cat "$ROLLBACK_DIR/previous-release")" "$DRILL_ROOT/current.next"
  mv -Tf "$DRILL_ROOT/current.next" "$DRILL_ROOT/current"
}

# 세 경로가 모두 바뀐 뒤 실패시켜 현재 실행의 복구 묶음이 ERR trap으로 적용되는지 확인한다.
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

# 실패 시 프론트 경로·백엔드 설정·호환 포인터가 함께 복구됐는지 확인한다.
[[ "$(readlink "$DRILL_ROOT/current")" = "releases/$OLD_RELEASE" ]]
[[ "$(cat "$DRILL_ROOT/current/version.txt")" = "old" ]]
grep -Fqx "root $DRILL_ROOT/current;" "$NGINX_CONFIG"
grep -Fqx "set \$service_url blue;" "$SERVICE_ENV"
[[ -d "$RELEASE_ROOT/$NEW_RELEASE" ]]
[[ "$(cat "$STALE_ROLLBACK_DIR/previous-release")" = \
   "releases/9999999999999999999999999999999999999999" ]]

echo "Combined release cutover drill passed (routing source, attempt isolation, ERR rollback)."
