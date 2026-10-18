#!/usr/bin/env bash
set -Eeuo pipefail

# Called by the existing approved release workflow. Never changes DNS or provider settings.
OPERATION=${1:?operation required}
RELEASE=${2:?release SHA required}
[[ "$RELEASE" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid domain release SHA'; exit 1; }
APP_ROOT=/usr/share/nginx/html
MARKETING_ROOT=$APP_ROOT/marketing
APP_RELEASE=$APP_ROOT/releases/$RELEASE
MARKETING_RELEASE=$MARKETING_ROOT/releases/$RELEASE
require_pointer() { [[ "$1" = none || "$1" =~ ^releases/[0-9a-f]{40}$ ]] || { echo 'Unexpected domain release pointer'; exit 1; }; }
swap_pointer() {
  local root=$1 name=$2 target=$3
  require_pointer "$target"
  if [ "$target" = none ]; then rm -f -- "$root/$name"; return; fi
  test -d "$root/$target"
  ln -sfn "$target" "$root/$name.next"
  mv -Tf "$root/$name.next" "$root/$name"
}
case "$OPERATION" in
  stage)
    test -f "$APP_RELEASE/index.html"
    SOURCE=/home/ubuntu/reserve-marketing-$RELEASE
    test -f "$SOURCE/index.html"
    test "$(tr -d '\r\n' < "$SOURCE/release-id.txt")" = "$RELEASE"
    mkdir -p "$MARKETING_ROOT/releases"
    if [ ! -d "$MARKETING_RELEASE" ]; then
      INCOMING=$MARKETING_ROOT/releases/.incoming-$RELEASE
      mkdir -p "$INCOMING"
      cp -a "$SOURCE/." "$INCOMING/"
      test "$(tr -d '\r\n' < "$INCOMING/release-id.txt")" = "$RELEASE"
      chown -R nginx:nginx "$INCOMING" 2>/dev/null || true
      mv "$INCOMING" "$MARKETING_RELEASE"
    fi
    test "$(tr -d '\r\n' < "$MARKETING_RELEASE/release-id.txt")" = "$RELEASE"
    ;;
  snapshot|restore)
    BACKUP=${3:?rollback directory required}
    [[ "$BACKUP" =~ ^/home/ubuntu/release-rollback-$RELEASE-[0-9]+-[0-9]+(\.tmp)?$ ]] || { echo 'Unexpected rollback directory'; exit 1; }
    test -d "$BACKUP"
    for NAME in marketing legacy; do
      if [ "$NAME" = marketing ]; then ROOT=$MARKETING_ROOT; POINTER=current; else ROOT=$APP_ROOT; POINTER=legacy-domain.current; fi
      if [ "$OPERATION" = snapshot ]; then
        PREVIOUS=$(readlink "$ROOT/$POINTER" 2>/dev/null || printf none)
        require_pointer "$PREVIOUS"
        printf '%s\n' "$PREVIOUS" > "$BACKUP/previous-$NAME"
      elif [ -f "$BACKUP/previous-$NAME" ]; then
        mkdir -p "$ROOT"
        swap_pointer "$ROOT" "$POINTER" "$(cat "$BACKUP/previous-$NAME")"
      fi
    done
    ;;
  promote)
    test "$(tr -d '\r\n' < "$APP_RELEASE/release-id.txt")" = "$RELEASE"
    test "$(tr -d '\r\n' < "$MARKETING_RELEASE/release-id.txt")" = "$RELEASE"
    swap_pointer "$MARKETING_ROOT" current "releases/$RELEASE"
    swap_pointer "$APP_ROOT" legacy-domain.current "releases/$RELEASE"
    ;;
  *) echo 'Unknown domain release operation'; exit 1 ;;
esac
