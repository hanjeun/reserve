#!/usr/bin/env bash
# Build the reviewed v2.6.3 compatibility bridge in an isolated, disposable CI directory.
# Never replace candidate sources, use a floating ref, copy local secrets, or delete a checkout.
set -Eeuo pipefail
BASE=b478ae8d732afa1e35642d790bfc39972556f885
ROOT=$(git rev-parse --show-toplevel)
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  git fetch --no-tags --depth=1 origin "$BASE"
fi
BRIDGE_DIR=$(mktemp -d "${RUNNER_TEMP:-/tmp}/reserve-v270-rollback-XXXXXX")
git archive "$BASE" | tar -x -C "$BRIDGE_DIR"
node "$ROOT/scripts/prepare-v270-rollback.mjs" "$BRIDGE_DIR" --git-patch | git -C "$BRIDGE_DIR" apply --
(
  cd "$BRIDGE_DIR/backend"
  chmod +x ./gradlew
  ./gradlew test --tests kr.it.reserve.chat.ChatRollbackCompatibilityTest \
    --tests kr.it.reserve.chat.ChatConcurrencyGuardTest bootJar --console=plain
)
BRIDGE_JAR="$BRIDGE_DIR/backend/build/libs/reserve-2.6.3.jar"
test -s "$BRIDGE_JAR"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'bridge_dir=%s\nbridge_jar=%s\n' "$BRIDGE_DIR" "$BRIDGE_JAR" >> "$GITHUB_OUTPUT"
fi
printf 'Rollback compatibility bridge verified: base=%s\n' "$BASE"
