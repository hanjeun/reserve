import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, parseRequest, validateConfig } from '../contracts.mjs';
import { handleRequest } from '../gateway.mjs';
import { COUNT_KEYS, METRIC_KEYS, sanitizeChecks } from '../output.mjs';
import { parseContainer, parseCounts, parseIdentity, parseMetrics, validateVerifierConfig } from '../snapshot.mjs';

const now = Date.parse('2026-10-23T00:00:00Z');
const release = 'a'.repeat(40);
const config = { schemaVersion: 1, enabled: true, readOnly: true, expectedRelease: release, verifierSha256: 'b'.repeat(64) };
const input = changes => JSON.stringify({
    schemaVersion: 1, action: 'reserve.verify_counts.v1', requestId: '6c3c8310-2915-43a0-9e22-aa5ab0f9f10e',
    issuedAt: new Date(now).toISOString(), ttlSeconds: 60, expectedRelease: release, configHash: digest(config), ...changes,
});
const counts = Object.fromEntries(COUNT_KEYS.map(key => [key, 0]));
function setup(overrides = {}) {
    const records = new Map();
    let calls = 0;
    const context = {
        loadConfig: async () => config, now: () => now,
        store: {
            async claim(id, fingerprint) {
                if (records.has(id)) {
                    if (records.get(id) !== fingerprint) throw new Error('REQUEST_ID_REUSE');
                    return 'duplicate';
                }
                records.set(id, fingerprint);
                return 'claimed';
            },
            async complete() {},
        },
        providers: {
            async identity() { return { upstream: 'blue', release }; },
            async counts() { calls++; return { state: 'observed', counts }; },
        },
        ...overrides,
    };
    return { context, calls: () => calls };
}
test('requests reject extra command/SQL/path/env/URL and malformed time inputs', () => {
    for (const field of ['command', 'sql', 'path', 'env', 'url']) assert.throws(() => parseRequest(input({ [field]: 'synthetic-forbidden-input' }), now), /INVALID_SCHEMA/);
    for (const action of ['sh', 'reserve.restart.v1', '']) assert.throws(() => parseRequest(input({ action }), now), /INVALID_REQUEST/);
    assert.throws(() => parseRequest(input({ issuedAt: '2026-02-30T00:00:00Z' }), now), /INVALID_TIME/);
    assert.throws(() => parseRequest(input({ issuedAt: new Date(now - 60_000).toISOString() }), now), /REQUEST_EXPIRED/);
    assert.throws(() => parseRequest(input({ issuedAt: new Date(now + 31_000).toISOString() }), now), /REQUEST_FROM_FUTURE/);
    assert.throws(() => parseRequest(input({ ttlSeconds: 301 }), now));
    assert.throws(() => parseRequest(' '.repeat(4097), now));
    assert.throws(() => validateConfig({ ...config, readOnly: false }));
});
test('future write actions are denied before config, ledger or providers run', async () => {
    const fail = () => { throw new Error('must not be called'); };
    const result = await handleRequest(input({ action: 'reserve.alloy_start_once.v1' }), { loadConfig: fail, store: {}, providers: {}, now: () => now });
    assert.equal(result.outcome, 'DENIED');
    assert.equal(result.reason, 'WRITE_CAPABILITY_NOT_GRANTED');
    assert.equal(result.executed, false);
    assert.equal(result.auditRecorded, false);
});
test('a fresh zero is observed, duplicate IDs never execute again, changed reuse is rejected', async () => {
    const setupResult = setup();
    const first = await handleRequest(input(), setupResult.context);
    assert.equal(first.outcome, 'OBSERVED');
    assert.equal(first.executed, true);
    assert.equal(first.auditRecorded, true);
    assert.equal(first.transportVerified, false);
    assert.deepEqual(first.checks.operations.counts, counts);
    assert.equal((await handleRequest(input(), setupResult.context)).outcome, 'DUPLICATE');
    assert.equal(setupResult.calls(), 1);
    const changed = await handleRequest(input({ ttlSeconds: 59 }), setupResult.context);
    assert.equal(changed.reason, 'REQUEST_ID_REUSE');
    assert.equal(setupResult.calls(), 1);
});
test('config hashes, actual release and changes during observation fail closed', async () => {
    const first = setup();
    assert.equal((await handleRequest(input({ configHash: 'c'.repeat(64) }), first.context)).reason, 'CONFIG_HASH_MISMATCH');
    assert.equal(first.calls(), 0);
    const wrong = setup({ providers: { async identity() { return { upstream: 'blue', release: 'd'.repeat(40) }; } } });
    assert.equal((await handleRequest(input(), wrong.context)).reason, 'EXPECTED_RELEASE_MISMATCH');
    let identityCalls = 0;
    const changed = setup({ providers: {
        async identity() { return { upstream: ++identityCalls === 1 ? 'blue' : 'green', release }; },
        async counts() { return { state: 'observed', counts }; },
    } });
    const result = await handleRequest(input(), changed.context);
    assert.equal(result.outcome, 'UNKNOWN');
    assert.equal(result.reason, 'IDENTITY_CHANGED');
    assert.equal(result.executed, true);
});
test('ledger failures stop reads and never claim audited success', async () => {
    const failure = setup({ store: { async claim() { throw new Error('LEDGER_UNAVAILABLE'); } } });
    const result = await handleRequest(input(), failure.context);
    assert.equal(result.reason, 'LEDGER_UNAVAILABLE');
    assert.equal(result.auditRecorded, false);
    assert.equal(result.executed, false);
    assert.equal(failure.calls(), 0);
});
const verifier = [
    '[check] stale READY payments (> 7d): 0',
    '[check] open payment reconciliation issues: 0',
    '[check] unfinished PortOne webhooks: 0',
    '[check] file deletion outbox: pending=0, failed=0',
    '[check] OAuth unlink outbox: unresolved=0',
    '[check] payment invariants: ledger=0, reservation-deposit=0',
    'synthetic-private-row synthetic-identifier synthetic-key /private/example',
].join('\n');
test('verifier output is counts-only and execution failure is unknown, never zero', () => {
    const result = parseCounts(verifier, 0);
    assert.deepEqual(result, { state: 'observed', counts });
    assert.equal(JSON.stringify(result).includes('synthetic'), false);
    assert.deepEqual(parseCounts(verifier, 1), { state: 'unknown', reason: 'VERIFIER_EXECUTION_FAILED', counts: null });
    assert.equal(parseCounts(verifier.replace('issues: 0', 'issues: 1'), 2).state, 'attention');
    assert.equal(parseCounts(verifier.replace('issues: 0', 'issues: 1'), 0).state, 'unknown');
    assert.equal(parseCounts(verifier + '\n[check] open payment reconciliation issues: 0', 0).state, 'unknown');
    assert.equal(parseCounts(verifier.replace('issues: 0', 'issues: 999999999999999999999'), 2).state, 'unknown');
    assert.equal(parseCounts(verifier.replace('[check] OAuth unlink outbox: unresolved=0', ''), 0).state, 'unknown');
});
test('the output projection drops adapter identifiers, paths and arbitrary properties', async () => {
    const fixture = setup({ providers: {
        async identity() { return { upstream: 'blue', release }; },
        async counts() { return { state: 'observed', raw: 'synthetic-secret', path: '/private/example', counts: { ...counts, identifier: 'synthetic-secret' } }; },
    } });
    const result = await handleRequest(input(), fixture.context);
    assert.equal(result.outcome, 'OBSERVED');
    assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
    assert.equal(JSON.stringify(result).includes('/private'), false);
});
test('host metrics expose allowlisted numbers but never certify fallback zeroes as healthy', () => {
    const lines = METRIC_KEYS.map(key => 'kind=host metric=' + key + ' value=0').join('\n');
    const result = parseMetrics(lines + '\nkind=container name=synthetic-private metric=cpu_pct value=999', 20);
    assert.equal(result.state, 'unknown');
    assert.equal(result.reason, 'METRIC_SAMPLE_VALIDITY_UNVERIFIED');
    assert.equal(Object.keys(result.values).length, METRIC_KEYS.length);
    assert.equal(JSON.stringify(result).includes('synthetic-private'), false);
    assert.equal(parseMetrics(lines, 181).values, null);
    assert.equal(parseMetrics(lines.split('\n').slice(1).join('\n'), 10).values, null);
    assert.equal(parseMetrics('', 0).state, 'unknown');
});
test('snapshot keeps missing collection, overlapping collectors and mismatched release pointers visible', () => {
    const stopped = { state: 'attention', running: false, oomKilled: false, restartCount: 0 };
    const running = { state: 'observed', running: true, oomKilled: false, restartCount: 0 };
    const result = sanitizeChecks('reserve.snapshot.v1', {
        health: { status: 'UP', components: { synthetic: 'private' } }, container: running,
        metrics: { values: null }, pointers: { releases: { app: { release }, marketing: { release: 'f'.repeat(40) }, legacy: { release } } },
        monitoring: { alloy: running, promtail: running, loki: running, grafana: stopped, appLogAgeSeconds: null, backupLogAgeSeconds: 50, raw: 'synthetic-secret' },
    }, release);
    assert.equal(result.pointers.state, 'attention');
    assert.equal(result.monitoring.collectorConflict, true);
    assert.equal(result.monitoring.state, 'attention');
    assert.equal(result.monitoring.remoteIngestionVerified, false);
    assert.equal(result.monitoring.restoreVerified, false);
    assert.equal(JSON.stringify(result).includes('synthetic'), false);
});
test('identity and container parsers accept only their fixed contract', () => {
    assert.deepEqual(parseIdentity('set $service_url blue;\n', 'public/example:sha-' + release), { upstream: 'blue', release });
    assert.throws(() => parseIdentity('set $service_url blue; arbitrary command', 'public/example:sha-' + release));
    assert.throws(() => parseIdentity('set $service_url blue;', 'public/example:latest'));
    assert.equal(parseContainer('{"running":true,"oomKilled":false,"restartCount":0}', 0).state, 'observed');
    assert.equal(parseContainer('{"running":true,"oomKilled":false,"restartCount":0}', 1).state, 'unknown');
});
test('the verifier configuration cannot fall back to root, target another DB or evaluate shell code', () => {
    const safe = "DB_NAME=reserve\nMYSQL_CONTAINER=mysql\nDB_USER=reserve_dots_reader\nDB_PASSWORD='synthetic-local-password-only'\n";
    assert.equal(validateVerifierConfig(safe), true);
    assert.equal(validateVerifierConfig(safe.replace('DB_USER=reserve_dots_reader', 'DB_USER=root')), false);
    assert.equal(validateVerifierConfig(safe.replace('DB_USER=reserve_dots_reader\n', '')), false);
    assert.equal(validateVerifierConfig(safe.replace('DB_NAME=reserve', 'DB_NAME=other')), false);
    assert.equal(validateVerifierConfig(safe + 'DB_USER=root\n'), false);
    assert.equal(validateVerifierConfig(safe + 'eval synthetic-command\n'), false);
    assert.equal(validateVerifierConfig(safe.replace("'synthetic-local-password-only'", '$(synthetic-command)')), false);
});
