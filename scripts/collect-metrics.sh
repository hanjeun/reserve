#!/usr/bin/env bash
#
# RESERVE host/container metrics collector. Runs every minute from cron.
#
# Deployed to the server at ~/collect-metrics.sh -- this file is the source of
# truth. See docs/technical/monitoring.md for why there is no Prometheus and
# how to install it on a fresh box.
#
# One metric per line: Loki's unwrap keeps every other parsed field as a label,
# so packing them together would make each sample its own time series.
set -uo pipefail

LOG_DIR=/var/log/metrics
LOG_FILE="$LOG_DIR/metrics-$(date +%F).log"
mkdir -p "$LOG_DIR"
exec 2>>"$LOG_DIR/collector.err"

emit_host() { printf 'kind=host metric=%s value=%s\n' "$1" "$2" >> "$LOG_FILE"; }

# vmstat's FIRST sample is an average since boot and is useless; the second is real.
CPU_IDLE=$(vmstat 1 2 | tail -1 | awk '{print $15}')
emit_host cpu_pct "$(awk -v i="${CPU_IDLE:-100}" 'BEGIN{printf "%.1f", 100-i}')"

# mem_used_pct from `available`, not `used` -- Linux counts page cache as used.
read -r MEM_USED MEM_AVAIL MEM_PCT <<<"$(free -m | awk '/^Mem:/{printf "%d %d %.1f", $3, $7, ($2-$7)/$2*100}')"
emit_host mem_used_mb      "$MEM_USED"
emit_host mem_available_mb "$MEM_AVAIL"
emit_host mem_used_pct     "$MEM_PCT"

emit_host swap_used_mb "$(free -m | awk '/^Swap:/{print $3}')"

read -r DISK_USED DISK_PCT <<<"$(df -m / | awk 'NR==2{printf "%d %d", $3, int($3/$2*100)}')"
emit_host disk_used_mb  "$DISK_USED"
emit_host disk_used_pct "$DISK_PCT"

read -r LOAD1 LOAD15 <<<"$(awk '{print $1, $3}' /proc/loadavg)"
emit_host load1  "$LOAD1"
emit_host load15 "$LOAD15"

docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' 2>/dev/null |
while IFS='|' read -r NAME CPU MEM PCT; do
  [ -z "${NAME:-}" ] && continue
  MEM_MB=$(printf '%s' "$MEM" | awk -F'/' '{gsub(/[[:space:]]/,"",$1); print $1}' | awk '
    /GiB$/ {sub(/GiB$/,""); printf "%.1f", $0*1024; next}
    /MiB$/ {sub(/MiB$/,""); printf "%.1f", $0;      next}
    /KiB$/ {sub(/KiB$/,""); printf "%.3f", $0/1024; next}
    /B$/   {sub(/B$/,"");   printf "%.6f", $0/1048576; next}
                            {print "0"}')
  printf 'kind=container name=%s metric=mem_mb value=%s\n'  "$NAME" "${MEM_MB:-0}" >> "$LOG_FILE"
  printf 'kind=container name=%s metric=mem_pct value=%s\n' "$NAME" "${PCT%\%}"    >> "$LOG_FILE"
  printf 'kind=container name=%s metric=cpu_pct value=%s\n' "$NAME" "${CPU%\%}"    >> "$LOG_FILE"
done

find "$LOG_DIR" -maxdepth 1 -name 'metrics-*.log' -mtime +30 -delete 2>/dev/null
find "$LOG_DIR" -maxdepth 1 -name 'collector.err' -size +10M -delete 2>/dev/null
