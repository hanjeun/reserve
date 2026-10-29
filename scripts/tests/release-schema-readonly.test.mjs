import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const source = readFileSync(new URL('../verify-post-deploy-readonly.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const bash = process.platform === 'win32'
    ? `${process.env.ProgramFiles ?? 'C:/Program Files'}/Git/bin/bash.exe`
    : '/bin/bash';

// 외부 도구를 찾을 수 없는 환경의 합성 응답으로 검사하며 실제 운영 스키마·MySQL 실행은 검증하지 않는다.
const mocks = String.raw`
exec 3>&2
PATH=/reserve-schema-test-no-executables
export PATH
docker() {
    if [[ "$1" == inspect ]]; then
        printf 'MOCK inspect\n' >&3
        if [[ "$#" == 4 && "$2" == -f && "$3" == '{{.State.Running}}' && "$4" == mysql ]]; then
            printf 'true\n'
        elif [[ "$#" != 2 || "$2" != mysql ]]; then return 98; fi
        return 0
    fi
    [[ "$1" == exec && "$2" == -e && "$3" == MYSQL_PWD=synthetic-schema-test-only && "$4" == mysql && "$5" == mysql ]] || return 98
    local query
    for query in "$@"; do :; done
    if [[ "$RESERVE_VERIFY_AUTH_ADMISSION_SCHEMA" == 1 || "$RESERVE_VERIFY_V11_SCHEMA" == 1 ]]; then
        [[ "$query" == 'START TRANSACTION READ ONLY; '* && "$query" == *' ROLLBACK;' ]] || return 97
    fi
    printf 'SQL %s\n' "$query" >&3
    if [[ -n "$MOCK_QUERY_FAILURE" && "$query" == *"$MOCK_QUERY_FAILURE"* ]]; then return 96; fi
    if [[ -n "$MOCK_FAIL_SQL" && "$query" == *"$MOCK_FAIL_SQL"* ]]; then printf '0\n'; return 0; fi
    case "$query" in
        *"SELECT IF(SUBSTRING_INDEX(CURRENT_USER(),'@',1) = 'reserve_backup', 1, 0);"*) printf '%s\n' "$MOCK_AUTHENTICATED_ROLE" ;;
        *"SELECT COUNT(*) FROM information_schema.tables"*"table_name IN ('member','reservation','login_method_challenge','login_session','reservation_request')"*) printf '5\n' ;;
        *"SELECT COUNT(*) FROM information_schema.tables"*"table_name IN ('mfa_account','mfa_credential','mfa_challenge','mfa_recovery_code','test_settlement_payout','reservation_consent','reservation_retention_hold')"*) printf '7\n' ;;
        *"SELECT COUNT(*) FROM information_schema.columns"*"table_name = 'mfa_credential' AND column_name IN"*) printf '6\n' ;;
        *"SELECT COUNT(*) FROM information_schema.columns"*"character_set_name = 'ascii'"*) printf '2\n' ;;
        *'FROM information_schema.'*)
            if [[ "$query" != *'SELECT CONCAT(table_name'* ]]; then printf '1\n'; fi ;;
        *'SELECT COUNT(*) FROM payment '*|*'SELECT COUNT(*) FROM payment_reconciliation_issue '*|*'SELECT COUNT(*) FROM payment_webhook_inbox '*|*'SELECT COUNT(*) FROM file_deletion_task '*|*'SELECT COUNT(*) FROM oauth_unlink_task '*|*'SELECT COUNT(*) FROM reservation '*) printf '0\n' ;;
        *) printf 'Unexpected synthetic query; refusing execution\n' >&2; return 98 ;;
    esac
}
`;

function run(overrides = {}) {
    const result = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
        input: `${mocks}\n${source}`,
        encoding: 'utf8',
        timeout: process.platform === 'win32' ? 30000 : 5000,
        env: {
            ...process.env, BASH_ENV: '', ENV: '',
            RESERVE_VERIFY_ENV: '/reserve-schema-test-missing-config',
            RESERVE_VERIFY_AUTH_ADMISSION_SCHEMA: '1', RESERVE_VERIFY_WAITING_SIGNUP_SCHEMA: '0',
            RESERVE_VERIFY_V11_SCHEMA: '0',
            RESERVE_VERIFY_PREVIEW_SCHEMA: '0', MYSQL_CONTAINER: 'mysql', DB_NAME: 'reserve',
            DB_USER: 'reserve_backup', DB_PASSWORD: 'synthetic-schema-test-only', STALE_READY_DAYS: '7',
            MOCK_AUTHENTICATED_ROLE: '1', MOCK_FAIL_SQL: '', MOCK_QUERY_FAILURE: '', ...overrides,
        },
    });
    assert.ifError(result.error);
    return result;
}

test('legacy verification does not require the new schema without explicit opt-in', () => {
    const result = run({ RESERVE_VERIFY_AUTH_ADMISSION_SCHEMA: '0' });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /login_methods_managed|login_method_challenge|login_session|reservation_request|CURRENT_USER|START TRANSACTION/);
});

test('invalid opt-in and a privileged configured account fail before Docker or SQL', () => {
    for (const overrides of [
        { RESERVE_VERIFY_AUTH_ADMISSION_SCHEMA: 'true' },
        { DB_USER: 'root' },
        { DB_USER: 'reserve_app' },
    ]) {
        const result = run(overrides);
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.stderr, /MOCK inspect|SQL /);
    }
});

test('authenticated role mismatch stops before inspecting any business or schema table', () => {
    const result = run({ MOCK_AUTHENTICATED_ROLE: '0' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /authenticated backup role differs/);
    assert.doesNotMatch(result.stderr, /FROM information_schema|FROM payment /);
});

test('opt-in requires auth, session and idempotency contracts in read-only transactions', () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    for (const contract of ['login_methods_managed', 'login_method_challenge', 'login_session', 'reservation_request',
        'uk_login_method_member_purpose', 'uk_login_session_sid', 'uk_login_session_hash',
        'uk_reservation_request_member_key', 'fk_login_method_member',
        'fk_reservation_request_member', 'fk_reservation_request_reservation', 'ascii_bin']) {
        assert.ok(result.stderr.includes(contract), `must verify ${contract}`);
    }
    const queries = result.stderr.split('\n').filter(line => line.startsWith('SQL '));
    assert.ok(queries.length > 40);
    for (const query of queries) {
        assert.ok(query.startsWith('SQL START TRANSACTION READ ONLY; SELECT '), query);
        assert.ok(query.endsWith(' ROLLBACK;'), query);
        assert.doesNotMatch(query, /\b(?:ALTER|CREATE|UPDATE|DELETE|INSERT|DROP|GRANT)\s/i);
    }
    assert.match(result.stdout, /actual release JAR validation is still required/);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-schema-test-only/);
    assert.ok(result.stderr.includes("BINARY column_type = BINARY 'enum(''PASSWORD_SETUP'',''SOCIAL_LINK'',''SOCIAL_REAUTH'')'"));
    assert.ok(result.stderr.includes("BINARY column_type = BINARY 'enum(''GOOGLE'',''KAKAO'',''LOCAL'',''NAVER'')'"));
    assert.ok(result.stderr.includes("extra = 'auto_increment'"));
});

for (const [name, fault, expected] of [
    ['a missing table or a non-InnoDB parent', "table_name IN ('member','reservation','login_method_challenge','login_session','reservation_request')", /tables must exist and use InnoDB/],
    ['the managed-login type/default', "table_name = 'member' AND column_name = 'login_methods_managed'", /column contract differs: member.login_methods_managed/],
    ['the session hash type/nullability', "table_name = 'login_session' AND column_name = 'refresh_token_hash'", /column contract differs: login_session.refresh_token_hash/],
    ['the unique refresh hash index', "index_name = 'uk_login_session_hash'", /index contract differs: login_session.uk_login_session_hash/],
    ['reservation key comparison', "character_set_name = 'ascii'", /require ascii_bin comparison/],
    ['the member deletion foreign key', "k.constraint_name = 'fk_reservation_request_member'", /foreign key contract differs: reservation_request.fk_reservation_request_member/],
]) {
    test(`schema differences fail closed: ${name}`, () => {
        const result = run({ MOCK_FAIL_SQL: fault });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, expected);
        assert.doesNotMatch(result.stdout, /PASS:|auth\/admission schema: contract matches/);
    });
}

test('an unsuccessful metadata query cannot be reported as an empty healthy result', () => {
    const result = run({ MOCK_QUERY_FAILURE: "table_name = 'login_session' AND column_name = 'refresh_token_hash'" });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /PASS:|auth\/admission schema: contract matches/);
});

test('v11 opt-in checks JDBC evidence contracts with the backup role and read-only transactions', () => {
    const result = run({ RESERVE_VERIFY_AUTH_ADMISSION_SCHEMA: '0', RESERVE_VERIFY_V11_SCHEMA: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /v11\/JDBC schema: contract matches/);
    for (const contract of ['mfa_credential', 'uk_mfa_credential_slot', 'verified_disputed',
        'notice_snapshot', 'fk_reservation_consent_reservation', 'released_at', 'fk_reservation_retention_hold'])
        assert.ok(result.stderr.includes(contract), contract);
    for (const query of result.stderr.split('\n').filter(line => line.startsWith('SQL '))) {
        assert.ok(query.startsWith('SQL START TRANSACTION READ ONLY; SELECT '), query);
        assert.ok(query.endsWith(' ROLLBACK;'), query);
    }
    for (const overrides of [{ DB_USER: 'root' }, { MOCK_AUTHENTICATED_ROLE: '0' }, { RESERVE_VERIFY_V11_SCHEMA: 'true' }]) {
        const failure = run({ RESERVE_VERIFY_AUTH_ADMISSION_SCHEMA: '0', RESERVE_VERIFY_V11_SCHEMA: '1', ...overrides });
        assert.notEqual(failure.status, 0);
        assert.doesNotMatch(failure.stderr, /FROM information_schema|FROM payment /);
    }
});

test('v11 missing evidence columns, weakened holds and failed queries stop verification', () => {
    for (const fault of ["table_name = 'reservation_consent' AND column_name = 'notice_snapshot'",
        "k.constraint_name = 'fk_reservation_retention_hold'", "index_name = 'uk_mfa_credential_slot'",
        "table_name = 'mfa_credential' AND column_name IN"]) {
        const result = run({ RESERVE_VERIFY_V11_SCHEMA: '1', MOCK_FAIL_SQL: fault });
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.stdout, /v11\/JDBC schema: contract matches|PASS:/);
    }
    const result = run({ RESERVE_VERIFY_V11_SCHEMA: '1', MOCK_QUERY_FAILURE: "table_name = 'reservation_consent'" });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /v11\/JDBC schema: contract matches|PASS:/);
});
