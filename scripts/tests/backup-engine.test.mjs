import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../backup-mysql.sh', import.meta.url), 'utf8');
const allocationStart = source.indexOf('open_dump || fail');
const dumpStart = source.indexOf('log "dumping..."');
assert.ok(allocationStart > 0 && dumpStart > allocationStart, 'The backup must allocate its output before dumping');
const preflight = source.slice(0, allocationStart);
const allocation = source.slice(0, dumpStart);
const bash = process.platform === 'win32'
    ? (process.env.ProgramFiles ?? 'C:/Program Files') + '/Git/bin/bash.exe'
    : '/bin/bash';

// 실제 덤프·파일 쓰기·업로드·삭제 없이 백업 전 조회와 거부 조건만 검사한다.
const mocks = String.raw`
exec 3>&2
PATH=/reserve-backup-test-no-executables
export PATH
mkdir() { [[ "$#" == 3 && "$1" == -p ]]; }
dirname() { printf '%s\n' /synthetic; }
touch() { [[ "$#" == 1 && "$1" == "$LOG_FILE" ]]; }
chmod() { [[ "$#" == 2 && "$1" == 640 && "$2" == "$LOG_FILE" ]]; }
date() { printf '%s\n' 20000101-000000; }
tee() {
    [[ "$#" == 2 && "$1" == -a && "$2" == "$LOG_FILE" ]] || return 98
    local line
    while IFS= read -r line; do printf '%s\n' "$line"; done
}
df() {
    [[ "$#" == 2 && "$1" == -Pm && "$2" == "$BACKUP_DIR" ]] || return 98
    printf 'synthetic 2048 1024 1024 50%% /synthetic\n'
}
awk() {
    [[ "$#" == 1 && "$1" == 'NR==2 {print $4}' ]] || return 98
    local line
    while IFS= read -r line; do :; done
    printf '1024\n'
}
docker() {
    case "$1" in
        inspect)
            if [[ "$#" == 2 && "$2" == "$MYSQL_CONTAINER" ]]; then return 0; fi
            [[ "$#" == 4 && "$2" == -f && "$3" == '{{.State.Running}}' && "$4" == "$MYSQL_CONTAINER" ]] || return 98
            printf 'true\n' ;;
        exec)
            [[ "$#" == 11 && "$2" == -e && "$3" == MYSQL_PWD && "$4" == "$MYSQL_CONTAINER" && "$5" == mysql ]] || return 98
            [[ "$MYSQL_PWD" == synthetic-backup-only && "$*" != *synthetic-backup-only* ]] || return 98
            [[ "$6" == --user=reserve_backup && "$7" == --batch && "$8" == --skip-column-names && "$9" == reserve_synthetic ]] || return 98
            local query
            for query; do :; done
            case "$query" in
                *'FROM information_schema.user_privileges'*)
                    printf 'MOCK_ROUTINE_QUERY\n' >&3
                    printf '%s\n' "$MOCK_ROUTINE_ACCESS" ;;
                *'FROM information_schema.tables'*)
                    [[ "$query" == *'table_schema = DATABASE()'* && "$query" == *"table_type = 'BASE TABLE'"* ]] || return 98
                    [[ "$query" == *'ENGINE IS NULL'* && "$query" == *"ENGINE <> 'InnoDB'"* ]] || return 98
                    printf 'MOCK_ENGINE_QUERY\n' >&3
                    printf '%s' "$MOCK_ENGINE_RESULT"
                    [[ "$MOCK_ENGINE_QUERY_FAIL" != 1 ]] || return 12 ;;
                *) return 98 ;;
            esac ;;
        *) printf 'UNEXPECTED_DOCKER_COMMAND\n' >&3; return 98 ;;
    esac
}
aws() { printf 'UNEXPECTED_UPLOAD\n' >&3; return 98; }
mysqldump() { printf 'UNEXPECTED_DUMP\n' >&3; return 98; }
rm() { printf 'UNEXPECTED_DELETE\n' >&3; return 98; }
`;

function run(overrides = {}, script = preflight + '\nprintf "PREFLIGHT_COMPLETE\\n" >&3\n') {
    const result = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
        input: mocks + '\n' + script,
        encoding: 'utf8',
        timeout: 5000,
        env: {
            SystemRoot: process.env.SystemRoot ?? '',
            PATH: '/reserve-backup-test-no-executables', BASH_ENV: '', ENV: '',
            RESERVE_BACKUP_ENV: '/reserve-backup-test-no-config',
            MYSQL_CONTAINER: 'mysql_synthetic', DB_NAME: 'reserve_synthetic', DB_USER: 'reserve_backup',
            DB_PASSWORD: 'synthetic-backup-only', BACKUP_DIR: '/synthetic/backup', LOG_FILE: '/synthetic/backup.log',
            BACKUP_S3_BUCKET: 'synthetic-no-upload', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', AWS_DEFAULT_REGION: '',
            MOCK_ROUTINE_ACCESS: '1', MOCK_ENGINE_RESULT: '12\t0', MOCK_ENGINE_QUERY_FAIL: '0',
            ...overrides,
        },
    });
    assert.ifError(result.error);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-backup-only|UNEXPECTED_/);
    return result;
}

test('backup preflight accepts one visible InnoDB table set with the configured backup role and database', () => {
    const result = run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /PREFLIGHT_COMPLETE/);
    assert.equal(result.stderr.match(/MOCK_ENGINE_QUERY/g)?.length, 1);
    assert.equal(result.stderr.match(/MOCK_ROUTINE_QUERY/g)?.length, 1);
});

test('backup preflight refuses a failed engine query even if it returned plausible counts', () => {
    const result = run({ MOCK_ENGINE_QUERY_FAIL: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /cannot verify table storage engines/);
    assert.doesNotMatch(result.stderr, /PREFLIGHT_COMPLETE/);
});

for (const [name, counts] of [
    ['a non-InnoDB or unknown engine', '12\t1'],
    ['an empty or invisible base-table set', '0\t0'],
    ['empty metadata', ''],
    ['a missing engine count', '12'],
    ['a NULL engine count', '12\tNULL'],
    ['negative metadata', '12\t-1'],
    ['unexpected separators', '12 0'],
    ['extra columns', '12\t0\textra'],
    ['extra result rows', '12\t0\n13\t0'],
    ['noncanonical counts', '012\t0'],
]) {
    test('backup preflight refuses ' + name + ' before the dump boundary', () => {
        const result = run({ MOCK_ENGINE_RESULT: counts });
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /backup requires visible InnoDB base tables/);
        assert.doesNotMatch(result.stderr, /PREFLIGHT_COMPLETE/);
    });
}

test('the existing routine privilege guard still refuses before the engine query', () => {
    const result = run({ MOCK_ROUTINE_ACCESS: '0' });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /stored routine definitions are not readable/);
    assert.doesNotMatch(result.stderr, /MOCK_ENGINE_QUERY|PREFLIGHT_COMPLETE/);
});

// 임의 소유 표식이 있는 전용 임시 파일만 만들고 정리한다.
function withOutputFixture(check) {
    const parent = fs.realpathSync(tmpdir());
    const directory = fs.mkdtempSync(path.join(parent, 'reserve-backup-output-'));
    const resolved = fs.realpathSync(directory);
    const owner = randomUUID();
    const marker = path.join(resolved, '.owner');
    fs.writeFileSync(marker, owner, { flag: 'wx' });
    try {
        const backup = path.join(resolved, 'reserve-20000101-000000.sql.gz');
        const env = {
            BACKUP_DIR: resolved.replaceAll('\\', '/'),
            LOG_FILE: path.join(resolved, 'synthetic.log').replaceAll('\\', '/'),
            FIXTURE_OWNER_FILE: marker.replaceAll('\\', '/'),
            FIXTURE_OWNER: owner,
        };
        return check({ backup, env });
    } finally {
        assert.equal(fs.realpathSync(directory), resolved);
        assert.equal(path.dirname(resolved), parent);
        assert.ok(path.basename(resolved).startsWith('reserve-backup-output-'));
        assert.equal(fs.readFileSync(marker, 'utf8'), owner);
        fs.rmSync(resolved, { recursive: true });
    }
}

const outputMocks = String.raw`
rm() {
    [[ "$#" == 2 && "$1" == -f && "$2" == "$DUMP_FILE" ]] || return 98
    [[ "$DUMP_FILE" == "$BACKUP_DIR/reserve-20000101-000000.sql.gz" ]] || return 98
    [[ "$(< "$FIXTURE_OWNER_FILE")" == "$FIXTURE_OWNER" ]] || return 98
    printf 'FIXTURE_REMOVE\n' >&3
    command /usr/bin/rm -- "$DUMP_FILE"
}
basename() {
    [[ "$#" == 1 && "$1" == "$DUMP_FILE" ]] || return 98
    printf 'reserve-20000101-000000.sql.gz\n'
}
`;

function allocate(env, tail = '\nprintf "ALLOCATED\\n" >&3\n') {
    return run(env, outputMocks + '\n' + allocation + tail);
}

test('backup output preserves an existing dump when preflight fails', () => withOutputFixture(({ backup, env }) => {
    fs.writeFileSync(backup, 'retained-fixture', { flag: 'wx' });
    const result = allocate({ ...env, MOCK_ENGINE_QUERY_FAIL: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /cannot verify table storage engines/);
    assert.doesNotMatch(result.stderr, /FIXTURE_REMOVE|ALLOCATED/);
    assert.equal(fs.readFileSync(backup, 'utf8'), 'retained-fixture');
}));

test('backup output refuses a filename collision without overwriting or deleting the existing dump', () => withOutputFixture(({ backup, env }) => {
    fs.writeFileSync(backup, 'retained-fixture', { flag: 'wx' });
    const result = allocate(env);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /dump path already exists or cannot be created/);
    assert.doesNotMatch(result.stderr, /FIXTURE_REMOVE|ALLOCATED/);
    assert.equal(fs.readFileSync(backup, 'utf8'), 'retained-fixture');
}));

test('backup output removes only its own incomplete fixture after failure', () => withOutputFixture(({ backup, env }) => {
    const result = allocate(env, '\n[[ ! -o noclobber ]] || exit 91\nprintf partial-fixture >&"$DUMP_FD"\nfail "synthetic incomplete dump"\n');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /synthetic incomplete dump/);
    assert.match(result.stderr, /FIXTURE_REMOVE/);
    assert.equal(fs.existsSync(backup), false);
}));

test('backup output retains its own verified fixture after a later failure', () => withOutputFixture(({ backup, env }) => {
    const result = allocate(env, '\nprintf verified-fixture >&"$DUMP_FD"\nDUMP_VERIFIED=1\nfail "synthetic post-verify failure"\n');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /retaining verified local backup after failure/);
    assert.doesNotMatch(result.stderr, /FIXTURE_REMOVE/);
    assert.equal(fs.readFileSync(backup, 'utf8'), 'verified-fixture');
}));
