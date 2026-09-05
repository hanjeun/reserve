#!/usr/bin/env bash
# CI/local drill for the same-directory symlink rename used by the frontend deployment.

set -euo pipefail

DRILL_ROOT="$(mktemp -d)"
cleanup() { rm -rf "$DRILL_ROOT"; }
trap cleanup EXIT

RELEASE_ROOT="$DRILL_ROOT/releases"
OLD_RELEASE="1111111111111111111111111111111111111111"
NEW_RELEASE="2222222222222222222222222222222222222222"

mkdir -p "$RELEASE_ROOT/$OLD_RELEASE" "$RELEASE_ROOT/$NEW_RELEASE"
printf 'old\n' > "$RELEASE_ROOT/$OLD_RELEASE/version.txt"
printf 'new\n' > "$RELEASE_ROOT/$NEW_RELEASE/version.txt"

ln -sfn "releases/$OLD_RELEASE" "$DRILL_ROOT/current"
[[ "$(cat "$DRILL_ROOT/current/version.txt")" = "old" ]]

ln -sfn "releases/$NEW_RELEASE" "$DRILL_ROOT/current.next"
mv -Tf "$DRILL_ROOT/current.next" "$DRILL_ROOT/current"
[[ "$(readlink "$DRILL_ROOT/current")" = "releases/$NEW_RELEASE" ]]
[[ "$(cat "$DRILL_ROOT/current/version.txt")" = "new" ]]
[[ -d "$RELEASE_ROOT/$OLD_RELEASE" ]]

# Rollback uses the identical atomic swap and must leave the newer release available.
ln -sfn "releases/$OLD_RELEASE" "$DRILL_ROOT/current.next"
mv -Tf "$DRILL_ROOT/current.next" "$DRILL_ROOT/current"
[[ "$(readlink "$DRILL_ROOT/current")" = "releases/$OLD_RELEASE" ]]
[[ "$(cat "$DRILL_ROOT/current/version.txt")" = "old" ]]
[[ -d "$RELEASE_ROOT/$NEW_RELEASE" ]]

echo "Frontend release swap drill passed (deploy and rollback)."
