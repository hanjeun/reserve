#!/usr/bin/env bash
# Copy only the original hashed assets of the live and one retained release into staging.
# Old documents can then finish lazy imports through the unchanged /assets/ URL.
set -Eeuo pipefail

[[ $# -eq 3 ]] || { echo 'Usage: preserve-frontend-assets.sh incoming release-root current-path' >&2; exit 1; }
RELEASE_ROOT=$(readlink -f "$2")
STAGE=$(readlink -f "$1")
[[ -d "$RELEASE_ROOT" && -d "$STAGE/assets" && ! -L "$STAGE/assets" ]] || exit 1
[[ "$(dirname "$STAGE")" = "$RELEASE_ROOT" && "$(basename "$STAGE")" =~ ^\.incoming-[0-9a-f]{40}$ ]] || {
  echo 'Refusing an unexpected staging directory' >&2; exit 1;
}
MANIFEST=reserve-assets.sha256

owned_records() {
  local directory=$1
  if [[ -f "$directory/$MANIFEST" && ! -L "$directory/$MANIFEST" ]]; then
    cat "$directory/$MANIFEST"
  else
    # First upgrade from the pre-manifest deployment: all its assets are original.
    (cd "$directory" && find assets -mindepth 1 -maxdepth 1 -type f -print0 | sort -z | xargs -0 -r sha256sum --binary)
  fi
}

validate_record() {
  [[ "$1" =~ ^[0-9a-f]{64}$ && "$2" =~ ^assets/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|ttf|otf|png|jpe?g|webp|svg|gif|avif)$ && -z "$3" ]] || {
    echo 'Invalid hashed asset manifest record' >&2; return 1;
  }
}

# Save ownership before inheritance. Future deployments must not inherit inherited assets forever.
[[ ! -e "$STAGE/$MANIFEST" ]] || { echo 'Staging ownership manifest already exists' >&2; exit 1; }
OWN_RECORDS=$(owned_records "$STAGE")
[[ -n "$OWN_RECORDS" ]] || { echo 'Staged assets are empty' >&2; exit 1; }
while read -r digest relative extra; do
  relative=${relative#\*}
  validate_record "$digest" "$relative" "$extra"
done <<< "$OWN_RECORDS"
printf '%s\n' "$OWN_RECORDS" > "$STAGE/$MANIFEST"

CURRENT=$(readlink -f "$3" 2>/dev/null || true)
SOURCES=()
if [[ -d "$CURRENT/assets" && "$(dirname "$CURRENT")" = "$RELEASE_ROOT" && "$(basename "$CURRENT")" =~ ^[0-9a-f]{40}$ ]]; then
  SOURCES+=("$CURRENT")
fi
CANDIDATES=$(find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -regextype posix-extended -regex '.*/[0-9a-f]{40}' -printf '%T@ %p\n' | sort -rn)
while read -r modified directory; do
  [[ -n "$directory" && "$directory" != "$CURRENT" ]] || continue
  [[ "$(dirname "$directory")" = "$RELEASE_ROOT" && ! -L "$directory" ]] || exit 1
  [[ -d "$directory/assets" ]] || continue
  SOURCES+=("$directory")
  [[ ${#SOURCES[@]} -ge 2 ]] && break
done <<< "$CANDIDATES"

COPIED=0
for directory in "${SOURCES[@]}"; do
  [[ ! -L "$directory/assets" ]] || exit 1
  RECORDS=$(owned_records "$directory")
  [[ -n "$RECORDS" ]] || continue
  while read -r digest relative extra; do
    relative=${relative#\*}
    validate_record "$digest" "$relative" "$extra"
    SOURCE="$directory/$relative"
    TARGET="$STAGE/$relative"
    [[ -f "$SOURCE" && ! -L "$SOURCE" ]] || exit 1
    ACTUAL=$(sha256sum --binary "$SOURCE"); [[ "${ACTUAL%% *}" = "$digest" ]] || {
      echo 'Retained asset digest mismatch' >&2; exit 1;
    }
    if [[ -e "$TARGET" || -L "$TARGET" ]]; then
      [[ -f "$TARGET" && ! -L "$TARGET" ]] || exit 1
      ACTUAL=$(sha256sum --binary "$TARGET"); [[ "${ACTUAL%% *}" = "$digest" ]] || {
        echo 'Same asset filename has different bytes; refusing overwrite' >&2; exit 1;
      }
    else
      cp -p -- "$SOURCE" "$TARGET"
      ACTUAL=$(sha256sum --binary "$TARGET"); [[ "${ACTUAL%% *}" = "$digest" ]] || exit 1
      COPIED=$((COPIED + 1))
    fi
  done <<< "$RECORDS"
done
echo "Retained hashed assets verified: $COPIED copied from ${#SOURCES[@]} releases"
