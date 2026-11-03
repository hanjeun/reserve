#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  false) exit 0 ;;
  true) shift ;;
  *) echo 'Shared authentication limits require an explicit true or false flag' >&2; exit 2 ;;
esac
if [ "$#" -eq 0 ]; then
  echo 'Candidate and recovery image references are required' >&2
  exit 2
fi
for image in "$@"; do
  if [[ ! "$image" =~ ^([a-z0-9][a-z0-9._/-]*@)?sha256:[a-f0-9]{64}$ ]]; then
    echo 'Authentication compatibility requires immutable image references' >&2
    exit 2
  fi
  capability=$(docker image inspect --format '{{index .Config.Labels "reserve.auth-compat"}}' "$image")
  if [ "$capability" != 'browser-sensitive-shared-limits-v1' ]; then
    echo 'Shared authentication limits require compatible candidate and recovery images' >&2
    exit 1
  fi
done
