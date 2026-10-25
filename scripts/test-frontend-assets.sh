#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_ROOT=$(cd "$(dirname "$0")" && pwd)
DRILL_ROOT=$(mktemp -d)
cleanup() { [[ -n "$DRILL_ROOT" && -d "$DRILL_ROOT" ]] && rm -rf -- "$DRILL_ROOT"; }
trap cleanup EXIT
ROOT="$DRILL_ROOT/releases"
OLD="$ROOT/1111111111111111111111111111111111111111"
NEW="$ROOT/.incoming-2222222222222222222222222222222222222222"
mkdir -p "$OLD/assets" "$NEW/assets"
printf 'old lazy module\n' > "$OLD/assets/old-11111111.js"
printf 'new entry\n' > "$NEW/assets/new-22222222.js"
bash "$SCRIPT_ROOT/preserve-frontend-assets.sh" "$NEW" "$ROOT" "$OLD"
cmp "$OLD/assets/old-11111111.js" "$NEW/assets/old-11111111.js"
! grep -q 'old-11111111' "$NEW/reserve-assets.sha256"
grep -q 'new-22222222' "$NEW/reserve-assets.sha256"

# 다음 릴리스에는 이 릴리스의 원본 자산만 이어받는다.
SECOND="$ROOT/2222222222222222222222222222222222222222"
mv "$NEW" "$SECOND"
THIRD="$ROOT/.incoming-3333333333333333333333333333333333333333"
mkdir -p "$THIRD/assets"
printf 'third entry\n' > "$THIRD/assets/third-33333333.js"
bash "$SCRIPT_ROOT/preserve-frontend-assets.sh" "$THIRD" "$ROOT" "$SECOND"
cmp "$SECOND/assets/new-22222222.js" "$THIRD/assets/new-22222222.js"
! grep -q 'old-11111111\|new-22222222' "$THIRD/reserve-assets.sha256"

# 같은 파일명의 내용이 다르면 양쪽 원본을 유지한 채 거부한다.
COLLISION="$ROOT/.incoming-4444444444444444444444444444444444444444"
mkdir -p "$COLLISION/assets"
printf 'different bytes\n' > "$COLLISION/assets/new-22222222.js"
if bash "$SCRIPT_ROOT/preserve-frontend-assets.sh" "$COLLISION" "$ROOT" "$SECOND"; then
  echo 'Collision was accepted' >&2; exit 1
fi
[[ "$(cat "$COLLISION/assets/new-22222222.js")" = 'different bytes' ]]

# 소유 목록의 경로 이탈은 원본을 읽거나 복사하기 전에 거부한다.
printf '%064d  ../outside.js\n' 0 > "$OLD/reserve-assets.sha256"
INVALID="$ROOT/.incoming-5555555555555555555555555555555555555555"
mkdir -p "$INVALID/assets"
printf 'fifth entry\n' > "$INVALID/assets/fifth-55555555.js"
if bash "$SCRIPT_ROOT/preserve-frontend-assets.sh" "$INVALID" "$ROOT" "$OLD"; then
  echo 'Traversal was accepted' >&2; exit 1
fi
echo 'Frontend asset retention drill passed (legacy, ownership, collision, traversal)'
