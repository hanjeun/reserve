#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo 'Actual release compatibility requires immutable image references' >&2
  exit 2
fi
for image in "$@"; do
  if [[ ! "$image" =~ ^([a-z0-9][a-z0-9._/-]*@)?sha256:[a-f0-9]{64}$ ]]; then
    echo 'Actual release compatibility refuses mutable image references' >&2
    exit 2
  fi
  docker run --rm --pull=never --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 \
    --tmpfs /tmp:rw,noexec,nosuid,size=192m --entrypoint java "$image" \
    -Xmx96m -cp /opt/reserve/compat VerifyReleaseCompatibility /app.jar
done
