#!/usr/bin/env bash
# Loki가 지표마다 별도 시계열을 유지하도록 한 줄에 지표 하나만 기록한다.
set -uo pipefail

LOG_DIR=/var/log/metrics
LOG_FILE="$LOG_DIR/metrics-$(date +%F).log"
mkdir -p "$LOG_DIR"
exec 2>>"$LOG_DIR/collector.err"

emit_host() { printf 'kind=host metric=%s value=%s\n' "$1" "$2" >> "$LOG_FILE"; return; }

# 첫 표본은 부팅 이후 평균이므로 두 번째 표본을 사용한다.
read -r CPU_USER CPU_SYSTEM CPU_EXEC CPU_IDLE CPU_WAIT CPU_STEAL <<<"$(vmstat 1 2 | tail -1 | awk '{print $13, $14, $13+$14, $15, $16, $17}')"
# cpu_pct의 100-idle 의미를 유지하고 실행·I/O 대기·호스트 회수 비율은 별도로 기록한다.
emit_host cpu_pct "$(awk -v i="${CPU_IDLE:-100}" 'BEGIN{printf "%.1f", 100-i}')"
emit_host cpu_exec_pct   "${CPU_EXEC:-0}"
emit_host cpu_user_pct   "${CPU_USER:-0}"
emit_host cpu_system_pct "${CPU_SYSTEM:-0}"
emit_host cpu_iowait_pct "${CPU_WAIT:-0}"
emit_host cpu_steal_pct  "${CPU_STEAL:-0}"

# 페이지 캐시를 사용 중으로 계산하지 않도록 MemAvailable을 기준으로 한다.
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
  [[ -z "${NAME:-}" ]] && continue
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
