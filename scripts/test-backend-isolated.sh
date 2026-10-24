#!/usr/bin/env bash
# Disposable synthetic release checks. Never opens application DBs or the application's Redis.
set +x
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
gradle_filters=()
while (($#)); do
    if [[ "$1" != --tests || $# -lt 2 || ! "$2" =~ ^[A-Za-z0-9_.*?$]+$ ]]; then
        printf 'Only pairs of --tests and Java test patterns are accepted\n' >&2
        exit 2
    fi
    gradle_filters+=(--tests "$2")
    shift 2
done

command -v docker >/dev/null || { printf 'Docker is required for isolated backend checks\n' >&2; exit 1; }
export DOCKER_CONTEXT=default
export DOCKER_CONFIG="${HOME:?HOME is required}/.docker"
export MSYS_NO_PATHCONV=1
unset DOCKER_HOST DOCKER_TLS_VERIFY DOCKER_CERT_PATH
fixture_endpoint=$(docker --context default context inspect default --format '{{.Endpoints.docker.Host}}')
case "$fixture_endpoint" in
    unix:///*|npipe:////./pipe/*) ;;
    *) printf 'Isolated backend checks require the default local Docker engine\n' >&2; exit 1 ;;
esac

mysql_image='mysql@sha256:4af1f8815716546f5b12410f7621f37f93db8dd11a184706ef59111930b8c2ff'
redis_image='redis@sha256:5f2e6a105b2a8cc721911d5d29aadb032c25fe55b43e829e3d03413753ff47c2'
for fixture_image in "$mysql_image" "$redis_image"; do
    if ! docker --context default image inspect "$fixture_image" >/dev/null 2>&1; then
        docker --context default pull --quiet "$fixture_image" >/dev/null
    fi
done

random_hex() { od -An -N "$1" -tx1 /dev/urandom | tr -d ' \n'; }
fixture_suffix=$(random_hex 4)
fixture_owner=$(random_hex 16)
fixture_root_password=$(random_hex 32)
fixture_login_password=$(random_hex 32)
fixture_admission_password=$(random_hex 32)
fixture_capacity_password=$(random_hex 32)
fixture_oauth_password=$(random_hex 32)
fixture_name="reserve-backend-isolated-$fixture_suffix"
fixture_id=''
cleanup() {
    local result=$?
    trap - EXIT
    local target owner owned_ids
    local targets=("${fixture_id:-$fixture_name}")
    if owned_ids=$(docker --context default ps --all --quiet --filter "label=kr.it.reserve.isolated-test-owner=$fixture_owner"); then
        while IFS= read -r target; do
            [[ -z "$target" ]] || targets+=("$target")
        done <<< "$owned_ids"
    else
        printf 'Could not enumerate this run owned containers for cleanup\n' >&2
        [[ $result != 0 ]] || result=1
    fi
    for target in "${targets[@]}"; do
        if docker --context default container inspect "$target" >/dev/null 2>&1; then
            owner=$(docker --context default inspect --format '{{ index .Config.Labels "kr.it.reserve.isolated-test-owner" }}' "$target")
            if [[ "$owner" == "$fixture_owner" ]]; then
                if ! docker --context default rm --force --volumes "$target" >/dev/null 2>&1; then
                    printf 'Owned fixture container cleanup failed\n' >&2
                    [[ $result != 0 ]] || result=1
                fi
            else
                printf 'Refusing cleanup of a container without this run owner label\n' >&2
                [[ $result != 0 ]] || result=1
            fi
        fi
    done
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fixture_id=$(MYSQL_ROOT_PASSWORD="$fixture_root_password" docker --context default run --detach --rm \
    --name "$fixture_name" --label "kr.it.reserve.isolated-test-owner=$fixture_owner" \
    --memory=768m --memory-swap=768m --pids-limit=256 \
    --tmpfs /var/lib/mysql:rw,nosuid,nodev,size=768m --tmpfs /var/run/mysqld:rw,nosuid,nodev,size=16m \
    --publish 127.0.0.1::3306 --env MYSQL_ROOT_PASSWORD "$mysql_image" \
    --default-time-zone=+00:00 --innodb-buffer-pool-size=64M --innodb-redo-log-capacity=32M \
    --max-connections=100 --performance-schema=OFF --skip-log-bin)
[[ "$fixture_id" =~ ^[0-9a-f]{64}$ ]] || { printf 'Invalid owned MySQL fixture identity\n' >&2; exit 1; }
mysql_ready=false
for ((attempt=0; attempt<60; attempt++)); do
    if docker --context default exec "$fixture_id" sh -c \
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --protocol=TCP --host=127.0.0.1 --connect-timeout=2 --user=root --batch --silent --execute="SELECT 1"' \
        >/dev/null 2>&1; then
        mysql_ready=true
        break
    fi
    sleep 1
done
[[ "$mysql_ready" == true ]] || { printf 'Synthetic MySQL startup failed\n' >&2; exit 1; }
fixture_address=$(docker --context default port "$fixture_id" 3306/tcp)
[[ "$fixture_address" =~ ^127[.]0[.]0[.]1:([0-9]+)$ ]] || { printf 'MySQL fixture is not loopback only\n' >&2; exit 1; }
fixture_port=${BASH_REMATCH[1]}
fixture_login_db="reserve_release_login_$fixture_suffix"
fixture_admission_db="reserve_release_admission_$fixture_suffix"
fixture_capacity_db="reserve_release_capacity_$fixture_suffix"
fixture_oauth_db="reserve_release_oauth_$fixture_suffix"
fixture_login_user="reserve_login_test$fixture_suffix"
fixture_admission_user="reserve_admission_test$fixture_suffix"
fixture_capacity_user="reserve_capacity_test$fixture_suffix"
fixture_oauth_user="reserve_oauth_test$fixture_suffix"
# Generated identifiers and passwords are hex/alphanumeric; raw SQL and credentials are never printed.
if ! docker --context default exec -i "$fixture_id" sh -c \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --protocol=socket --user=root --batch --silent' \
    >/dev/null 2>&1 <<SQL
CREATE DATABASE $fixture_login_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE $fixture_admission_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE $fixture_capacity_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE $fixture_oauth_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '$fixture_login_user'@'%' IDENTIFIED BY '$fixture_login_password';
CREATE USER '$fixture_admission_user'@'%' IDENTIFIED BY '$fixture_admission_password';
CREATE USER '$fixture_capacity_user'@'%' IDENTIFIED BY '$fixture_capacity_password';
CREATE USER '$fixture_oauth_user'@'%' IDENTIFIED BY '$fixture_oauth_password';
GRANT ALL PRIVILEGES ON $fixture_login_db.* TO '$fixture_login_user'@'%';
GRANT ALL PRIVILEGES ON $fixture_admission_db.* TO '$fixture_admission_user'@'%';
GRANT ALL PRIVILEGES ON $fixture_capacity_db.* TO '$fixture_capacity_user'@'%';
GRANT ALL PRIVILEGES ON $fixture_oauth_db.* TO '$fixture_oauth_user'@'%';
SQL
then
    printf 'Synthetic MySQL account/schema preparation failed\n' >&2
    exit 1
fi
printf 'Owned MySQL fixture ready; backend checks use synthetic login/admission/capacity/OAuth databases\n'
# env -i also removes foreign environment names that Bash does not expose through compgen/unset.
runtime_environment=()
for variable in PATH HOME USERPROFILE USERNAME APPDATA LOCALAPPDATA SYSTEMROOT SystemRoot WINDIR windir COMSPEC ComSpec PATHEXT TEMP TMP TMPDIR JAVA_HOME GRADLE_USER_HOME LANG LC_ALL LC_CTYPE MSYSTEM; do
    if [[ -v "$variable" ]]; then runtime_environment+=("$variable=${!variable}"); fi
done
fixture_environment=(
    "DOCKER_CONTEXT=default" "DOCKER_CONFIG=$HOME/.docker" "MSYS_NO_PATHCONV=1" "AWS_EC2_METADATA_DISABLED=true"
    "RESERVE_MYSQL_LOGIN_TEST_ISOLATED=1" "RESERVE_ADMISSION_MYSQL_TEST=1" "RESERVE_CAPACITY_MYSQL_TEST=1" "RESERVE_MYSQL_OAUTH_TEST_ISOLATED=1"
    "RESERVE_ADMISSION_REDIS_TEST=1" "RESERVE_SERVICE_ADMISSION_HELPER_REDIS_TEST=1" "RESERVE_ISOLATED_TEST_OWNER=$fixture_owner"
    "RESERVE_MYSQL_LOGIN_TEST_URL=jdbc:mysql://127.0.0.1:$fixture_port/$fixture_login_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"
    "RESERVE_MYSQL_LOGIN_TEST_USER=$fixture_login_user" "RESERVE_MYSQL_LOGIN_TEST_PASSWORD=$fixture_login_password"
    "RESERVE_ADMISSION_MYSQL_URL=jdbc:mysql://127.0.0.1:$fixture_port/$fixture_admission_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"
    "RESERVE_ADMISSION_MYSQL_USER=$fixture_admission_user" "RESERVE_ADMISSION_MYSQL_PASSWORD=$fixture_admission_password"
    "RESERVE_CAPACITY_MYSQL_URL=jdbc:mysql://127.0.0.1:$fixture_port/$fixture_capacity_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"
    "RESERVE_CAPACITY_MYSQL_USER=$fixture_capacity_user" "RESERVE_CAPACITY_MYSQL_PASSWORD=$fixture_capacity_password"
    "RESERVE_MYSQL_OAUTH_TEST_URL=jdbc:mysql://127.0.0.1:$fixture_port/$fixture_oauth_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"
    "RESERVE_MYSQL_OAUTH_TEST_USER=$fixture_oauth_user" "RESERVE_MYSQL_OAUTH_TEST_PASSWORD=$fixture_oauth_password"
)
(
    cd -- "$repo_root/backend"
    env -i "${runtime_environment[@]}" "${fixture_environment[@]}" bash ./gradlew test --rerun --no-daemon --console=plain "${gradle_filters[@]}"
) 2>&1 | env -i "${runtime_environment[@]}" \
    RESERVE_ISOLATED_REDACT_SECRETS="$fixture_root_password:$fixture_login_password:$fixture_admission_password:$fixture_capacity_password:$fixture_oauth_password" \
    awk 'BEGIN { n = split(ENVIRON["RESERVE_ISOLATED_REDACT_SECRETS"], secrets, ":") }
         { for (i = 1; i <= n; i++) gsub(secrets[i], "[redacted]"); print; fflush() }'
