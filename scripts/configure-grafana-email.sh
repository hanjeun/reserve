#!/usr/bin/env bash
# Apply only after approval for the HTML upload and Grafana-only recreation.
# A public-url change requires its own explicit approval and the fourth argument.
set -euo pipefail
set +x
umask 077

template_candidate=${1:?usage: configure-grafana-email.sh template.html email.yml expected-sha256 [--public-url-approved]}
override_candidate=${2:?missing email override}
expected_sha=${3:?missing template SHA-256}
public_url_approved=${4:-}
case "$public_url_approved" in ''|--public-url-approved) ;; *) exit 1 ;; esac
case "$expected_sha" in *[!a-fA-F0-9]*|'') exit 1 ;; *) ;; esac
[[ "${#expected_sha}" -eq 64 ]]
base=/home/ubuntu/docker-compose-monitoring.yml
smtp=/home/ubuntu/docker-compose-monitoring-smtp.yml
email=/home/ubuntu/docker-compose-monitoring-email.yml
template_path=/home/ubuntu/grafana/emails/ng_alert_notification.html
container_template=/usr/share/grafana/public/emails/ng_alert_notification.html
cd /home/ubuntu
[[ -f "$template_candidate" ]]
[[ -f "$override_candidate" ]]
[[ -f "$base" ]]
[[ -f "$smtp" ]]
[[ "$(sha256sum "$template_candidate" | cut -d ' ' -f 1)" = "${expected_sha,,}" ]]
[[ "$(sudo -n docker inspect grafana --format '{{index .Config.Labels "com.docker.compose.project"}}')" = ubuntu ]]
[[ "$(sudo -n docker inspect grafana --format '{{.Config.Image}}')" = grafana/grafana:10.2.0 ]]
case "$(sudo -n docker inspect grafana --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}')" in
    "$base,$smtp"|"$base,$smtp,$email") ;;
    *) echo 'Unexpected Grafana compose files; aborting.' >&2; exit 1 ;;
esac
[[ "$(sudo -n docker inspect grafana --format '{{range .Mounts}}{{if eq .Destination "/var/lib/grafana"}}{{.Name}}{{end}}{{end}}')" = ubuntu_grafana-data ]]

case "$(sudo -n sed -n 's/^[[:space:]]*set \$service_url \(blue\|green\);[[:space:]]*$/\1/p' /home/ubuntu/nginx/service-env.inc)" in
    blue) app=blue; port=8080 ;;
    green) app=green; port=8081 ;;
    *) echo 'Active app color is not known; aborting.' >&2; exit 1 ;;
esac
[[ "$(sudo -n docker inspect "$app" --format '{{.State.Running}}')" = true ]]
while IFS= read -r entry; do
    case "$entry" in
        RESEND_API_KEY=*) export RESEND_API_KEY="${entry#RESEND_API_KEY=}" ;;
        MAIL_FROM=*) export MAIL_FROM="${entry#MAIL_FROM=}" ;;
        *) ;;
    esac
done < <(sudo -n docker inspect "$app" --format '{{range .Config.Env}}{{println .}}{{end}}')
while IFS= read -r entry; do
    case "$entry" in
        GF_SECURITY_ADMIN_PASSWORD=*) export GRAFANA_ADMIN_PASSWORD="${entry#GF_SECURITY_ADMIN_PASSWORD=}" ;;
        *) ;;
    esac
done < <(sudo -n docker inspect grafana --format '{{range .Config.Env}}{{println .}}{{end}}')
: "${RESEND_API_KEY:?existing app SMTP credential is missing}"
: "${MAIL_FROM:?existing app sender is missing}"
# Keep the existing seed exactly, including an empty value after DB setup.
# Do not invent a password or reset the already initialized Grafana account.
[[ "${GRAFANA_ADMIN_PASSWORD+x}" = x ]]

compose() {
    sudo -n --preserve-env=RESEND_API_KEY,MAIL_FROM,GRAFANA_ADMIN_PASSWORD docker compose -p ubuntu "$@"
}
environment_fingerprint() {
    sudo -n docker inspect grafana | python3 -c '
import hashlib,json,sys
env = json.load(sys.stdin)[0]["Config"]["Env"]
env = sorted(item for item in env if not item.startswith("GF_SERVER_ROOT_URL="))
print(hashlib.sha256(json.dumps(env, separators=(",", ":")).encode()).hexdigest())'
}
alert_fingerprint() {
    sudo -n python3 - <<'PY'
import hashlib,json,sqlite3
db = sqlite3.connect('file:/var/lib/docker/volumes/ubuntu_grafana-data/_data/grafana.db?mode=ro', uri=True)
db.execute('begin')
state = {}
for table in ('alert_rule', 'alert_configuration', 'ngalert_configuration'):
    rows = db.execute('select * from ' + table + ' order by id').fetchall()
    state[table] = [[value.hex() if isinstance(value, bytes) else value for value in row] for row in rows]
uids = {row[0] for row in db.execute('select uid from alert_rule')}
assert len(uids) == 9 or (len(uids) == 10 and 'reserve-app-log-heartbeat' in uids), 'Expected 9 base rules with at most the known heartbeat watch; aborting without changing routing.'
assert len(state['alert_configuration']) == 1
print(hashlib.sha256(json.dumps(state, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
db.rollback()
db.close()
PY
}
# Expanded configuration is piped only into a validator; it is never printed.
compose -f "$base" -f "$smtp" -f "$override_candidate" config --quiet
if [[ "$public_url_approved" = --public-url-approved ]]; then
    compose -f "$base" -f "$smtp" -f "$override_candidate" config --format json | python3 -c \
        'import json,sys; assert json.load(sys.stdin)["services"]["grafana"]["environment"]["GF_SERVER_ROOT_URL"] == "https://grafana.reserve.it.kr/"'
else
    compose -f "$base" -f "$smtp" -f "$override_candidate" config --format json | python3 -c \
        'import json,sys; assert "GF_SERVER_ROOT_URL" not in json.load(sys.stdin)["services"]["grafana"].get("environment", {})'
fi
untouched_names=()
for name in blue green mysql nginxserver loki promtail; do
    if sudo -n docker inspect "$name" >/dev/null 2>&1; then untouched_names+=("$name"); fi
done
untouched_before=$(sudo -n docker inspect "${untouched_names[@]}" --format '{{.Name}} {{.Id}} {{.State.StartedAt}}')
environment_before=$(environment_fingerprint)
alerts_before=$(alert_fingerprint)
backup_dir=$(mktemp -d /home/ubuntu/monitoring-before-email-XXXXXXXX)
cp -p "$base" "$backup_dir/base.yml"
cp -p "$smtp" "$backup_dir/smtp.yml"
sudo -n docker exec grafana cat "$container_template" > "$backup_dir/original-image-template.html"
had_email=false
had_template=false
if [[ -f "$email" ]]; then cp -p "$email" "$backup_dir/email.yml"; had_email=true; fi
if [[ -f "$template_path" ]]; then cp -p "$template_path" "$backup_dir/template.html"; had_template=true; fi
changed=false

rollback() {
    trap - ERR
    if "$had_email"; then
        cp -p "$backup_dir/email.yml" "$email"
    elif [[ -f "$email" ]]; then
        mv "$email" "$backup_dir/failed-email.yml"
    fi
    if "$had_template"; then
        cp -p "$backup_dir/template.html" "$template_path"
    elif [[ -f "$template_path" ]]; then
        mv "$template_path" "$backup_dir/failed-template.html"
    fi
    if "$had_email"; then
        compose -f "$base" -f "$smtp" -f "$email" up -d --no-deps --force-recreate --pull never grafana
    else
        compose -f "$base" -f "$smtp" up -d --no-deps --force-recreate --pull never grafana
    fi
    printf 'Previous Grafana configuration restored. Recovery files: %s\n' "$backup_dir" >&2
}
on_error() {
    code=$?
    if "$changed"; then rollback; fi
    exit "$code"
}
trap on_error ERR
changed=true
mkdir -p /home/ubuntu/grafana/emails
template_next=$(mktemp /home/ubuntu/grafana/emails/ng_alert_notification.html.XXXXXXXX)
cp "$template_candidate" "$template_next"
chmod 644 "$template_next"
mv "$template_next" "$template_path"
cp "$override_candidate" "$email"
chmod 600 "$email"
compose -f "$base" -f "$smtp" -f "$email" up -d --no-deps --force-recreate --pull never grafana
healthy=false
for attempt in {1..15}; do
    if curl -fsS http://127.0.0.1:3000/api/health | python3 -c \
        'import json,sys; assert json.load(sys.stdin)["database"] == "ok"' 2>/dev/null; then
        healthy=true
        break
    fi
    sleep 2
done
"$healthy"
[[ "$(sudo -n docker exec grafana sha256sum "$container_template" | cut -d ' ' -f 1)" = "${expected_sha,,}" ]]
[[ "$(sudo -n docker inspect grafana --format '{{range .Mounts}}{{if eq .Destination "/var/lib/grafana"}}{{.Name}}{{end}}{{end}}')" = ubuntu_grafana-data ]]
[[ "$environment_before" = "$(environment_fingerprint)" ]]
[[ "$alerts_before" = "$(alert_fingerprint)" ]]
[[ "$untouched_before" = "$(sudo -n docker inspect "${untouched_names[@]}" --format '{{.Name}} {{.Id}} {{.State.StartedAt}}')" ]]
if [[ "$public_url_approved" = --public-url-approved ]]; then
    sudo -n docker inspect grafana --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -qx 'GF_SERVER_ROOT_URL=https://grafana.reserve.it.kr/'
fi
curl -fsS "http://127.0.0.1:$port/actuator/health" | python3 -c \
    'import json,sys; assert json.load(sys.stdin)["status"] == "UP"; print("app_health=UP")'
trap - ERR
unset RESEND_API_KEY MAIL_FROM GRAFANA_ADMIN_PASSWORD
printf 'grafana_health=ok\nemail_template=verified\nnon_url_environment=unchanged\ninstalled_rules_and_contact_routing=unchanged\nunrelated_containers=unchanged\nrollback_configuration=%s\n' "$backup_dir"
