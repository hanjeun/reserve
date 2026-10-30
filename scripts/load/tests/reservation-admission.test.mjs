import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertIdentity, buildOptions, DEFAULTS, FIXTURE_KIND, parseOrigin, parseStatus, PROVISIONAL_TARGETS,
    reservationPayload, validateAttestation, validateCookies, validateIdentity, validatePlan,
} from '../reservation-admission-contract.mjs';
import { parseArguments, privateFile, run, sanitizeSummary } from '../run-reservation-admission.mjs';

const now = Date.parse('2026-10-23T00:00:00Z');
const identity = {
    schemaVersion: 1, kind: FIXTURE_KIND, fixtureId: '6c3c8310-2915-43a0-9e22-aa5ab0f9f10e',
    nonce: '176c1885-63e2-4a71-86eb-a2edeb6c04fd', origin: DEFAULTS.origin,
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 600_000).toISOString(),
    database: 'disposable', redis: 'disposable', paymentProvider: 'disabled', externalEffects: 'blocked',
    syntheticAccountsOnly: true, storeId: 900000001, campaignId: 'synthetic-load-fixture',
    reservationDate: '2026-10-24', reservationTime: '12:00', guestCount: 1, slotCapacity: 10,
};
const cookieFile = () => ({
    schemaVersion: 1, purpose: FIXTURE_KIND, fixtureId: identity.fixtureId, nonce: identity.nonce,
    origin: identity.origin, expiresAt: identity.expiresAt,
    accounts: Array.from({ length: DEFAULTS.vus }, (_, index) => ({ synthetic: true, cookies: { access_token: 'synthetic-fixture-token-only-' + index } })),
});
const args = ['--run-synthetic-load', '--fixture', 'synthetic-attestation', '--cookies', 'synthetic-cookies'];
const summary = () => ({
    schemaVersion: 1, scenario: DEFAULTS.scenario, measurementStatus: 'MEASURED', thresholdsPassed: true,
    metrics: { requests_completed: { count: 10, rate: 2 }, iterations_completed: { count: 5, rate: 1 }, dropped_iterations: { count: 0 } },
});
function context(changes = {}) {
    let launches = 0, identities = 0, reads = 0;
    return {
        count: () => ({ launches, identities, reads }),
        options: {
            now: () => now,
            readPrivate(file) {
                reads++;
                return { value: file === 'synthetic-attestation' ? { schemaVersion: 1, identity } : cookieFile(), sha256: 'a'.repeat(64), file };
            },
            async identity() { identities++; return { ...identity }; },
            async launch() { launches++; return { exitCode: 0, summary: summary() }; },
            ...changes,
        },
    };
}
test('only literal unprivileged loopback origins are accepted', () => {
    assert.equal(parseOrigin('http://127.0.0.1:18080'), 'http://127.0.0.1:18080');
    assert.equal(parseOrigin('http://[::1]:18080'), 'http://[::1]:18080');
    for (const origin of [
        'https://reserve.it.kr', 'http://reserve.it.kr:18080', 'http://localhost:18080', 'http://2130706433:18080',
        'http://127.0.0.1:80', 'http://127.0.0.1:65536', 'http://127.0.0.1:18080/path', 'http://user@127.0.0.1:18080',
        'http://127.0.0.1:18080?proxy=https://reserve.it.kr', 'https://127.0.0.1:18080', 'http://127.1:18080',
    ]) assert.throws(() => parseOrigin(origin), /LOOPBACK_ORIGIN_REQUIRED/);
});
test('approval and exact argument enum precede file reading or networking', async () => {
    const setup = context();
    const result = await run([], setup.options);
    assert.equal(result.reason, 'EXPLICIT_SYNTHETIC_APPROVAL_REQUIRED');
    assert.deepEqual(setup.count(), { launches: 0, identities: 0, reads: 0 });
    for (const extra of [['--cloud'], ['--url', 'https://reserve.it.kr'], ['--command', 'synthetic'], ['--scenario', 'all'], ['--run-synthetic-load']]) assert.throws(() => parseArguments([...args, ...extra]));
    const denied = await run([...args, '--origin', 'https://reserve.it.kr'], setup.options);
    assert.equal(denied.reason, 'LOOPBACK_ORIGIN_REQUIRED');
    assert.equal(setup.count().reads, 0);
});
test('live identity requires exact nonce/origin/fixture and real disposable-effect assertions', () => {
    assert.equal(validateAttestation({ schemaVersion: 1, identity }, identity.origin, now), identity);
    for (const change of [
        { database: 'production' }, { redis: 'shared' }, { paymentProvider: 'test-channel' },
        { externalEffects: 'allowed' }, { syntheticAccountsOnly: false }, { campaignId: null },
        { expiresAt: new Date(now).toISOString() }, { expiresAt: new Date(now + 901_000).toISOString() },
        { issuedAt: new Date(now + 31_000).toISOString() }, { reservationDate: '2026-02-30' }, { guestCount: 2 },
        { extra: 'synthetic-private-property' },
    ]) assert.throws(() => validateIdentity({ ...identity, ...change }, identity.origin, now));
    assert.throws(() => assertIdentity(identity, { ...identity, nonce: '993532da-9569-4471-9e48-d49254081ffa' }, now), /FIXTURE_IDENTITY_MISMATCH/);
});
test('cookies are synthetic, bound to the exact fixture, distinct and access-only', () => {
    assert.equal(validateCookies(cookieFile(), identity, DEFAULTS.vus, now).accounts.length, DEFAULTS.vus);
    for (const change of [{ purpose: 'production' }, { nonce: 'synthetic-other' }, { origin: 'https://reserve.it.kr' }, { accounts: [] }, { password: 'synthetic-private-property' }]) assert.throws(() => validateCookies({ ...cookieFile(), ...change }, identity, DEFAULTS.vus, now));
    const duplicate = cookieFile(); duplicate.accounts[1] = duplicate.accounts[0];
    assert.throws(() => validateCookies(duplicate, identity, DEFAULTS.vus, now));
    const extra = cookieFile(); extra.accounts[0].cookies.refresh_token = 'synthetic-refresh-token';
    assert.throws(() => validateCookies(extra, identity, DEFAULTS.vus, now));
    const injected = cookieFile(); injected.accounts[0].cookies.access_token = 'synthetic-token;\nheader: value';
    assert.throws(() => validateCookies(injected, identity, DEFAULTS.vus, now));
});
test('arrival rate/duration/VUs and remaining fixture lifetime are bounded', () => {
    assert.equal(validatePlan({ ...DEFAULTS }, identity, now).rate, DEFAULTS.rate);
    for (const change of [{ rate: 51 }, { vus: 101 }, { durationSeconds: 121 }, { origin: 'https://reserve.it.kr' }, { command: 'synthetic' }]) assert.throws(() => validatePlan({ ...DEFAULTS, ...change }, identity, now));
    assert.throws(() => validatePlan({ ...DEFAULTS }, { ...identity, expiresAt: new Date(now + 10_000).toISOString() }, now), /FIXTURE_TTL_TOO_SHORT/);
});
test('private inputs and live identity are all validated before any load launch', async () => {
    const setup = context({ async identity() { return { ...identity, nonce: '993532da-9569-4471-9e48-d49254081ffa' }; } });
    const result = await run(args, setup.options);
    assert.equal(result.reason, 'FIXTURE_IDENTITY_MISMATCH');
    assert.equal(result.executed, false);
    assert.equal(setup.count().launches, 0);
    const inaccessible = context({ readPrivate() { throw new Error('PRIVATE_LOCAL_FILE_REQUIRED'); } });
    const denied = await run(args, inaccessible.options);
    assert.equal(denied.reason, 'PRIVATE_LOCAL_FILE_REQUIRED');
    assert.equal(inaccessible.count().identities, 0);
});
test('runner results never include cookies, input paths, identifiers or arbitrary child output', async () => {
    const setup = context();
    const result = await run(args, setup.options);
    assert.equal(result.status, 'MEASURED');
    assert.equal(setup.count().launches, 1);
    const output = JSON.stringify(result);
    for (const text of ['synthetic-fixture-token-only', 'synthetic-cookies', 'synthetic-attestation', identity.fixtureId, identity.nonce]) assert.equal(output.includes(text), false);
    assert.equal(result.summary.productionCapacityProven, false);
    assert.equal(result.summary.databaseInvariantsProven, false);
    assert.equal(result.summary.redisAtomicityProven, false);
});
test('unavailable k6, missing summary or a failed target never reports load success', async () => {
    const unavailable = context({ async launch() { throw new Error('K6_UNAVAILABLE_OR_ABORTED'); } });
    const result = await run(args, unavailable.options);
    assert.equal(result.reason, 'K6_UNAVAILABLE_OR_ABORTED');
    assert.equal(result.executed, null);
    assert.equal(result.executionAttempted, true);
    const failed = context({ async launch() { return { exitCode: 99, summary: { ...summary(), thresholdsPassed: false } }; } });
    assert.equal((await run(args, failed.options)).status, 'INCOMPLETE');
    const incomplete = context({ async launch() { return { exitCode: 0, summary: { ...summary(), measurementStatus: 'INCOMPLETE' } }; } });
    assert.equal((await run(args, incomplete.options)).status, 'INCOMPLETE');
});
test('summary projection keeps aggregate numbers and excludes raw bodies, tags and tokens', () => {
    const projected = sanitizeSummary({
        ...summary(), raw: 'synthetic-private-cookie', cookies: cookieFile(), filename: 'synthetic-private-file',
        metrics: { requests_completed: { count: 10, rate: 2, token: 'synthetic-private-cookie', label: 'synthetic-private-label' }, arbitrary_metric: { count: 999 } },
    });
    assert.deepEqual(projected.metrics, { requests_completed: { count: 10, rate: 2 } });
    assert.equal(JSON.stringify(projected).includes('synthetic-private'), false);
    assert.equal(projected.targetClassification, PROVISIONAL_TARGETS.classification);
});
test('payload is fixed to the synthetic slot and cannot call payment or bypass admission', () => {
    const requestId = '993532da-9569-4471-9e48-d49254081ffa';
    const payload = reservationPayload(identity, identity.nonce, requestId);
    assert.deepEqual(payload, {
        storeId: identity.storeId, reservationDate: identity.reservationDate, reservationTime: identity.reservationTime,
        guestCount: 1, specialRequest: null, skipPayment: false, requestId, admissionTicket: identity.nonce,
    });
    assert.throws(() => reservationPayload(identity, 'http://production.invalid', requestId));
});
test('status parser respects the server poll contract and cancellation response boundary', () => {
    const value = { campaignId: identity.campaignId, state: 'WAITING', ticket: identity.nonce, position: 1, expiresAt: now + 60_000, serverTime: now, pollAfterSeconds: 4, raw: 'synthetic-private-value' };
    assert.equal(parseStatus(value, identity).state, 'WAITING');
    assert.equal(JSON.stringify(parseStatus(value, identity)).includes('synthetic-private'), false);
    assert.throws(() => parseStatus({ ...value, pollAfterSeconds: 1 }, identity));
    assert.throws(() => parseStatus({ ...value, state: 'CANCELLED' }, identity));
    assert.equal(parseStatus({ ...value, state: 'CANCELLED' }, identity, true).state, 'CANCELLED');
});
test('each experiment uses fixed arrival rate and preserves mandatory invariant/quality gates', () => {
    for (const scenario of ['queue-open', 'queue-status', 'booking-idempotency']) {
        const options = buildOptions({ ...DEFAULTS, scenario }, identity);
        const entry = Object.values(options.scenarios)[0];
        assert.equal(entry.executor, 'constant-arrival-rate');
        assert.equal(entry.rate, DEFAULTS.rate);
        assert.equal(entry.preAllocatedVUs, DEFAULTS.vus);
        assert.equal(entry.maxVUs, DEFAULTS.vus);
        assert.equal(options.maxRedirects, 0);
        assert.deepEqual(options.thresholds.idempotency_mismatches, ['count==0']);
        assert.deepEqual(options.thresholds.dropped_iterations, ['count==0']);
        assert.deepEqual(options.thresholds.reservations_unique_observed, ['count<=10']);
        assert.equal(options.systemTags.includes('url'), false);
    }
});
test('relative and network file paths are rejected before attempting private content reads', () => {
    assert.throws(() => privateFile('relative-cookie-file.json', 1000), /PRIVATE_LOCAL_FILE_REQUIRED/);
    assert.throws(() => privateFile('\\\\synthetic-server\\share\\cookies.json', 1000), /PRIVATE_LOCAL_FILE_REQUIRED/);
});
