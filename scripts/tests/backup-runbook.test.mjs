import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const document = fs.readFileSync(new URL('../../docs/technical/backup.md', import.meta.url), 'utf8');
const section = document.split('### 2-3. 실제 복원 (운영)')[1]?.split('### 2-4.')[0];
const procedure = section?.match(/```bash\r?\n([\s\S]*?)```/)?.[1];
assert.ok(procedure, 'The operating restore procedure must exist');

const bash = process.platform === 'win32'
    ? `${process.env.ProgramFiles ?? 'C:/Program Files'}/Git/bin/bash.exe`
    : '/bin/bash';

// No executable can be resolved from PATH. Every external command in the runbook is mocked.
// This exercises command ordering and fail-closed guards, not a MySQL/S3 restoration.
const mocks = String.raw`
exec 3>&2
PATH=/reserve-runbook-test-no-executables
export PATH
test() {
    [[ "$#" == 2 && "$1" == -f && "$2" == /var/backups/reserve/reserve-YYYYMMDD-HHMMSS.sql.gz ]]
}
tr() {
    [[ "$#" == 2 && "$1" == -d && "$2" == '\r\n' ]] || return 98
    local value
    IFS= read -r value || true
    printf '%s' "$value"
}
grep() {
    [[ "$#" == 2 && "$1" == -Exq && "$2" == 'blue|green' ]] || return 98
    local name
    while IFS= read -r name; do
        [[ "$name" != blue && "$name" != green ]] || return 0
    done
    return 1
}
sleep() { [[ "$#" == 1 && "$1" == 5 ]]; }
jq() {
    [[ "$#" == 2 && "$1" == -e ]] || return 98
    local body
    IFS= read -r body || return 1
    case "$2" in
        '.status == "UP"') [[ "$body" == '{"status":"UP"}' ]] ;;
        '.success == true and (.data.content | type == "array")')
            [[ "$body" == '{"success":true,"data":{"content":[]}}' ]] ;;
        *) return 98 ;;
    esac
}
sudo() {
    case "$*" in
        'reserve-restore --dry-run /var/backups/reserve/reserve-YYYYMMDD-HHMMSS.sql.gz')
            printf 'MOCK dry-run\n' >&3 ;;
        'docker exec nginxserver cat /etc/nginx/conf.d/service-env.inc')
            printf '%s\n' "$MOCK_UPSTREAM" ;;
        'docker inspect blue'|'docker inspect green')
            printf 'MOCK inspect %s\n' "$3" >&3 ;;
        'docker stop blue green')
            printf 'MOCK stop blue green\n' >&3 ;;
        "docker ps --format {{.Names}}")
            printf '%s\n' "$MOCK_RUNNING_CONTAINER" ;;
        '/usr/local/bin/reserve-backup')
            printf 'MOCK backup\n' >&3
            [[ "$MOCK_BACKUP_FAIL" != 1 ]] ;;
        'reserve-restore /var/backups/reserve/reserve-YYYYMMDD-HHMMSS.sql.gz')
            printf 'MOCK restore\n' >&3 ;;
        'docker start blue'|'docker start green')
            printf 'MOCK start %s\n' "$3" >&3 ;;
        *) printf 'Unexpected mocked command; refusing execution\n' >&2; return 98 ;;
    esac
}
curl() {
    local url
    for url; do :; done
    case "$url" in
        http://127.0.0.1:8080/actuator/health|http://127.0.0.1:8081/actuator/health)
            printf 'MOCK health %s\n' "$url" >&3
            printf '%s\n' "$MOCK_HEALTH_BODY" ;;
        'https://reserve.it.kr/api/stores?page=0&size=1')
            printf 'MOCK public-api\n' >&3
            printf '%s\n' "$MOCK_API_BODY" ;;
        *) printf 'Unexpected mocked URL; refusing execution\n' >&2; return 98 ;;
    esac
}
`;

function run(overrides = {}) {
    const result = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
        input: `${mocks}\n${procedure.replaceAll('\r\n', '\n')}`,
        encoding: 'utf8',
        timeout: 5000,
        env: {
            ...process.env,
            BASH_ENV: '',
            ENV: '',
            MOCK_UPSTREAM: 'set $service_url blue;',
            MOCK_RUNNING_CONTAINER: '',
            MOCK_BACKUP_FAIL: '0',
            MOCK_HEALTH_BODY: '{"status":"UP"}',
            MOCK_API_BODY: '{"success":true,"data":{"content":[]}}',
            ...overrides,
        },
    });
    assert.ifError(result.error);
    return result;
}

for (const [color, port] of [['blue', 8080], ['green', 8081]]) {
    test(`restore starts the original ${color} container and checks its ${port} JSON health`, () => {
        const result = run({ MOCK_UPSTREAM: `set $service_url ${color};` });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stderr, new RegExp(`MOCK start ${color}`));
        assert.match(result.stderr, new RegExp(`MOCK health http://127.0.0.1:${port}/actuator/health`));
        assert.doesNotMatch(result.stderr, new RegExp(`MOCK start ${color === 'blue' ? 'green' : 'blue'}`));
        const stages = ['dry-run', `inspect ${color}`, 'stop blue green', 'backup', 'restore', `start ${color}`, 'health', 'public-api'];
        let previous = -1;
        for (const stage of stages) {
            const position = result.stderr.indexOf(`MOCK ${stage}`);
            assert.ok(position > previous, `${stage} must follow the preceding guard`);
            previous = position;
        }
    });
}

test('invalid upstream refuses to stop or restore the app', () => {
    const result = run({ MOCK_UPSTREAM: 'set $service_url unknown;' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid nginx upstream/);
    assert.doesNotMatch(result.stderr, /MOCK stop|MOCK backup|MOCK restore|MOCK start/);
});

test('a still-running writer refuses backup and restore', () => {
    const result = run({ MOCK_RUNNING_CONTAINER: 'green' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /An app container is still running/);
    assert.doesNotMatch(result.stderr, /MOCK backup|MOCK restore|MOCK start/);
});

test('failure to preserve current data refuses actual restore and start', () => {
    const result = run({ MOCK_BACKUP_FAIL: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MOCK backup/);
    assert.doesNotMatch(result.stderr, /MOCK restore|MOCK start/);
});

for (const body of ['<html>SPA</html>', '{"status":"DOWN"}']) {
    test(`non-UP backend response (${body}) cannot pass the readiness guard`, () => {
        const result = run({ MOCK_HEALTH_BODY: body });
        assert.notEqual(result.status, 0);
        assert.equal(result.stderr.match(/MOCK health /g)?.length, 12);
        assert.doesNotMatch(result.stderr, /MOCK public-api/);
    });
}

test('a public API HTML response cannot pass as successful JSON', () => {
    const result = run({ MOCK_API_BODY: '<html>SPA</html>' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MOCK public-api/);
});
