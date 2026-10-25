#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

# 대상 Blue/Green 슬롯을 기동하기 직전에 확인하며, 세 번째 앱 기동에는 사용하지 않는다.
# 대상의 추가 메모리와 여유분을 실제 RAM으로 계산한다. 스왑은 포함하지 않는다.
die() { printf '[deployment-memory] %s\n' "$1" >&2; exit 1; }
[[ $# == 2 ]] || die 'usage: check-deployment-memory.sh LIVE TARGET (blue/green)'
live=$1
target=$2
case "$live:$target" in blue:green|green:blue) ;; *) die 'live and target must be distinct blue/green slots' ;; esac
for command in docker timeout awk cat; do command -v "$command" >/dev/null || die 'required read tool is unavailable'; done

deadline=$((SECONDS + 30))
bounded() {
    local remaining=$((deadline - SECONDS))
    (( remaining > 0 )) || return 124
    (( remaining <= 5 )) || remaining=5
    # 조회 명령의 실행 시간만 제한하며 컨테이너나 서비스를 변경하지 않는다.
    timeout --signal=TERM --kill-after=1s "${remaining}s" "$@" 2>/dev/null
}

snapshot() {
    local name=$1 id details state running paused restarting started extra
    id=$(bounded docker container ls --all --no-trunc --filter "name=^/${name}$" --format '{{.ID}}') \
        || die 'container listing failed or timed out'
    if [[ -z "$id" ]]; then printf 'absent'; return; fi
    [[ "$id" =~ ^[a-f0-9]{64}$ ]] || die 'container listing is ambiguous or malformed'
    details=$(bounded docker container inspect --format '{{.Id}} {{.State.Status}} {{.State.Running}} {{.State.Paused}} {{.State.Restarting}} {{.State.StartedAt}}' "$id") \
        || die 'container inspection failed or timed out'
    local inspected
    read -r inspected state running paused restarting started extra <<< "$details"
    [[ "$details" != *$'\n'* && "$inspected" == "$id" && -z "$extra" && "$started" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$ ]] \
        || die 'container inspection is malformed'
    case "$state:$running:$paused:$restarting" in
        running:true:false:false|exited:false:false:false|created:false:false:false) ;;
        *) die 'container is paused, restarting, or in an unsupported state' ;;
    esac
    printf '%s|%s|%s' "$id" "$state" "$started"
}

memory_kib() {
    local stats parsed
    stats=$(bounded docker stats --no-stream --format '{{.MemUsage}}' "$1") \
        || die 'container memory read failed or timed out'
    parsed=$(awk '
        function bytes(value, number, unit) {
            gsub(/^[ \t]+|[ \t]+$/, "", value)
            if (value !~ /^[0-9]+([.][0-9]+)?[ \t]*(B|KiB|MiB|GiB|TiB|kB|KB|MB|GB|TB)$/) return -1
            number=value; gsub(/[A-Za-z \t]/, "", number)
            unit=value; gsub(/[0-9. \t]/, "", unit)
            return (number+0)*scale[unit]
        }
        BEGIN { scale["B"]=1; scale["KiB"]=1024; scale["MiB"]=1048576; scale["GiB"]=1073741824; scale["TiB"]=1099511627776
                scale["kB"]=1000; scale["KB"]=1000; scale["MB"]=1000000; scale["GB"]=1000000000; scale["TB"]=1000000000000 }
        { if (NR != 1 || split($0, parts, "/") != 2) exit 1
          used=bytes(parts[1]); limit=bytes(parts[2]); if (used<=0 || limit<=0 || used>limit || limit>9007199254740991) exit 1
          kib=used/1024; rounded=int(kib); if (kib>rounded) rounded++; printf "%.0f", rounded; valid=1 }
        END { if (!valid || NR != 1) exit 1 }
    ' <<< "$stats") || die 'container memory format is invalid'
    [[ "$parsed" =~ ^[0-9]+$ ]] || die 'container memory is invalid'
    printf '%s' "$parsed"
}

live_before=$(snapshot "$live")
[[ "$live_before" == *'|running|'* ]] || die 'live app must be running'
live_id=${live_before%%|*}
target_before=$(snapshot "$target")
target_kib=0
target_state=absent
if [[ "$target_before" != absent ]]; then
    target_id=${target_before%%|*}
    [[ "$target_id" != "$live_id" ]] || die 'live and target resolve to the same container'
    target_state=${target_before#*|}; target_state=${target_state%%|*}
fi
live_kib=$(memory_kib "$live_id")
if [[ "$target_state" == running ]]; then target_kib=$(memory_kib "$target_id"); fi

meminfo=$(bounded cat /proc/meminfo) || die 'host memory read failed or timed out'
host=$(awk '
    $1=="MemTotal:" { if (NF!=3 || $2 !~ /^[0-9]+$/ || $3!="kB") exit 1; total=$2+0; totals++ }
    $1=="MemAvailable:" { if (NF!=3 || $2 !~ /^[0-9]+$/ || $3!="kB") exit 1; available=$2+0; available_fields++ }
    END { if (totals!=1 || available_fields!=1 || total<=0 || total>1099511627776 || available<0 || available>total) exit 1
          printf "%.0f %.0f", total, available }
' <<< "$meminfo") || die 'host MemTotal/MemAvailable is missing or invalid'
read -r total_kib available_kib <<< "$host"
(( live_kib <= total_kib && target_kib <= total_kib )) || die 'container memory exceeds physical host RAM'
[[ "$(snapshot "$live")" == "$live_before" && "$(snapshot "$target")" == "$target_before" ]] \
    || die 'container identity or state changed during the memory check'

expected_kib=$((768 * 1024))
(( live_kib <= expected_kib )) || expected_kib=$live_kib
additional_kib=$((expected_kib - target_kib))
(( additional_kib >= 0 )) || additional_kib=0
spare_kib=$((256 * 1024))
required_kib=$((additional_kib + spare_kib))
decision=allow
(( available_kib >= required_kib )) || decision=deny
printf '[deployment-memory] decision=%s live=%s target=%s target_state=%s available_kib=%s live_kib=%s target_kib=%s expected_kib=%s growth_kib=%s spare_kib=%s required_kib=%s\n' \
    "$decision" "$live" "$target" "$target_state" "$available_kib" "$live_kib" "$target_kib" "$expected_kib" "$additional_kib" "$spare_kib" "$required_kib"
[[ "$decision" == allow ]] || die 'insufficient available physical RAM; existing services were not changed'
