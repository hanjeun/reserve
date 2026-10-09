#!/usr/bin/env bash
set -euo pipefail
: "${RESERVE_SERVER_IP:?Server host is required}"
: "${EC2_SSH_KEY:?SSH key is required}"
: "${RESERVE_SSH_FINGERPRINT:?SSH fingerprint is required}"
: "${GITHUB_OUTPUT:?GitHub output file is required}"
if [[ ! "$RESERVE_SERVER_IP" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]; then
  echo "Invalid server host" >&2; exit 1
fi
TASK_SSH_DIR=$(mktemp -d -t reserve-detect.XXXXXX)
trap 'rm -f "$TASK_SSH_DIR/key" "$TASK_SSH_DIR/candidates" "$TASK_SSH_DIR/candidate" "$TASK_SSH_DIR/known_hosts" "$TASK_SSH_DIR/output"; rmdir "$TASK_SSH_DIR"' EXIT
printf '%s\n' "$EC2_SSH_KEY" > "$TASK_SSH_DIR/key"
chmod 600 "$TASK_SSH_DIR/key"
ssh-keyscan -T 5 -t ed25519,rsa,ecdsa "$RESERVE_SERVER_IP" > "$TASK_SSH_DIR/candidates" 2>/dev/null
: > "$TASK_SSH_DIR/known_hosts"
while IFS= read -r HOST_KEY; do
  [[ "$HOST_KEY" == \#* || -z "$HOST_KEY" ]] && continue
  printf '%s\n' "$HOST_KEY" > "$TASK_SSH_DIR/candidate"
  ACTUAL_FINGERPRINT=$(ssh-keygen -lf "$TASK_SSH_DIR/candidate" -E sha256 | awk '{print $2}')
  if [[ "$ACTUAL_FINGERPRINT" == "$RESERVE_SSH_FINGERPRINT" ]]; then
    printf '%s\n' "$HOST_KEY" >> "$TASK_SSH_DIR/known_hosts"
  fi
done < "$TASK_SSH_DIR/candidates"
if [[ ! -s "$TASK_SSH_DIR/known_hosts" ]]; then
  echo "SSH host fingerprint mismatch; refusing connection" >&2; exit 1
fi
# 실패할 수 있는 SSH 출력은 GITHUB_OUTPUT에 스트리밍하지 않는다.
STATUS=0
ssh -i "$TASK_SSH_DIR/key" -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$TASK_SSH_DIR/known_hosts" \
  -o GlobalKnownHostsFile=/dev/null -o ConnectTimeout=10 \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=2 \
  "ubuntu@$RESERVE_SERVER_IP" bash -se > "$TASK_SSH_DIR/output" <<'REMOTE' || STATUS=$?
set -eu
SERVICE_ENV_LINE=$(sudo docker exec nginxserver cat /etc/nginx/conf.d/service-env.inc \
  | tr -d '\r\n')
case "$SERVICE_ENV_LINE" in
  'set $service_url blue;') CURRENT_UPSTREAM=blue ;;
  'set $service_url green;') CURRENT_UPSTREAM=green ;;
  *)
    echo "Invalid nginx service-env.inc; refusing to guess the live upstream"
    exit 1
    ;;
esac

STATUS_BLUE=$(curl -o /dev/null -w "%{http_code}" -s --connect-timeout 5 --max-time 10 http://localhost:8080/actuator/health) || STATUS_BLUE="000"
STATUS_GREEN=$(curl -o /dev/null -w "%{http_code}" -s --connect-timeout 5 --max-time 10 http://localhost:8081/actuator/health) || STATUS_GREEN="000"
echo "routed=$CURRENT_UPSTREAM blue=$STATUS_BLUE green=$STATUS_GREEN"
ACTIVE_IMAGE=$(sudo docker inspect --format '{{.Image}}' "$CURRENT_UPSTREAM")
SCHEMA_COMPAT=$(sudo docker image inspect --format '{{index .Config.Labels "reserve.schema-compat"}}' "$ACTIVE_IMAGE")
if [ "$SCHEMA_COMPAT" != 'v270-refund-v1' ]; then
  echo "Active backend image is not schema/refund compatible; refusing automatic deployment"
  exit 1
fi
FEATURE_COMPAT=$(sudo docker image inspect --format '{{index .Config.Labels "reserve.feature-compat"}}' "$ACTIVE_IMAGE")
if [ "$FEATURE_COMPAT" != 'waiting-signup-hidden-v2' ]; then
  echo "Active recovery image does not support waiting settings, signup tickets and private message deletion; prepare an approved compatible baseline before automatic deployment"
  exit 1
fi
if { [ "$CURRENT_UPSTREAM" = "blue" ] && [ "$STATUS_BLUE" != "200" ]; } \
   || { [ "$CURRENT_UPSTREAM" = "green" ] && [ "$STATUS_GREEN" != "200" ]; }; then
  echo "Nginx points to an unhealthy upstream; refusing automatic deployment"
  exit 1
fi
echo "DETECTED_UPSTREAM=$CURRENT_UPSTREAM"
REMOTE
cat "$TASK_SSH_DIR/output"
if [[ "$STATUS" -ne 0 ]]; then exit "$STATUS"; fi
DETECTED=$(grep -E '^DETECTED_UPSTREAM=(blue|green)$' "$TASK_SSH_DIR/output" || true)
if [[ "$DETECTED" != 'DETECTED_UPSTREAM=blue' && "$DETECTED" != 'DETECTED_UPSTREAM=green' ]]; then
  echo "Invalid or ambiguous upstream output" >&2; exit 1
fi
printf 'current_upstream=%s\n' "${DETECTED#DETECTED_UPSTREAM=}" >> "$GITHUB_OUTPUT"
