#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
profile=${1:-}
case "$profile" in
  blue|green|mysql|redis|local-redis|monitoring) ;;
  monitoring-email|observability|alloy)
    echo 'Monitoring overlays require the monitoring profile with an explicit -f overlay file and service selection' >&2; exit 2 ;;
  *) echo 'Usage: bash scripts/compose.sh <profile> <compose arguments>' >&2; exit 2 ;;
esac
shift
# 저장소 이동으로 기존 프로젝트 이름·상대 mount·환경 파일이 달라지지 않게 한다.
options=(--project-directory "$root")
if [[ -f "$root/.env" ]]; then options+=(--env-file "$root/.env"); fi
export RESERVE_ALLOY_CONFIG_PATH="${RESERVE_ALLOY_CONFIG_PATH:-$root/infra/logging/alloy-config.alloy}"
exec docker compose "${options[@]}" -f "$root/infra/compose/docker-compose-$profile.yml" "$@"
