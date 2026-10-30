export const FIXTURE_KIND = 'reserve-reservation-admission-synthetic-v1';
export const IDENTITY_PATH = '/__reserve_load_fixture__/identity';
export const SCENARIOS = Object.freeze(['queue-open', 'queue-status', 'booking-idempotency']);
export const DEFAULTS = Object.freeze({ origin: 'http://127.0.0.1:18080', scenario: 'queue-open', rate: 2, durationSeconds: 15, vus: 10 });
export const PROVISIONAL_TARGETS = Object.freeze({
    classification: 'PROVISIONAL_EXPERIMENT_TARGET_NOT_SERVICE_SLO',
    httpP95Ms: 500, httpP99Ms: 1000, unexpectedErrorRate: 0.01, queueWaitP95Ms: 20000,
});
export const LIMITS = Object.freeze({ rate: 50, durationSeconds: 120, vus: 100, waitSeconds: 20, pollSeconds: 4, fixtureTtlSeconds: 900, responseBytes: 16384 });
export const STATES = Object.freeze(['WAITING', 'ADMITTED', 'CLAIMED', 'CONSUMED', 'EXPIRED', 'CLOSED', 'NOT_OPEN', 'FULL', 'CANCELLED']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
function keys(value, required) {
    if (!plain(value) || Object.keys(value).length !== required.length || required.some(key => !Object.prototype.hasOwnProperty.call(value, key))) throw new Error('INVALID_FIXTURE_CONTRACT');
}
export function parseOrigin(value) {
    const match = typeof value === 'string' && value.match(/^http:\/\/(127\.0\.0\.1|\[::1\]):([1-9]\d{3,4})$/);
    if (!match || !integer(Number(match[2]), 1024, 65535)) throw new Error('LOOPBACK_ORIGIN_REQUIRED');
    return value;
}
function instant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new Error('INVALID_FIXTURE_CONTRACT');
    const time = Date.parse(value);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')) throw new Error('INVALID_FIXTURE_CONTRACT');
    return time;
}
function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (plain(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
}
export function validateIdentity(identity, origin, now = Date.now()) {
    keys(identity, ['schemaVersion', 'kind', 'fixtureId', 'nonce', 'origin', 'issuedAt', 'expiresAt', 'database', 'redis', 'paymentProvider', 'externalEffects', 'syntheticAccountsOnly', 'storeId', 'campaignId', 'reservationDate', 'reservationTime', 'guestCount', 'slotCapacity']);
    if (identity.schemaVersion !== 1 || identity.kind !== FIXTURE_KIND || !UUID.test(identity.fixtureId) || !UUID.test(identity.nonce)
        || parseOrigin(identity.origin) !== parseOrigin(origin) || identity.database !== 'disposable' || identity.redis !== 'disposable'
        || identity.paymentProvider !== 'disabled' || identity.externalEffects !== 'blocked' || identity.syntheticAccountsOnly !== true
        || !integer(identity.storeId, 1, Number.MAX_SAFE_INTEGER) || typeof identity.campaignId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(identity.campaignId)
        || identity.guestCount !== 1 || !integer(identity.slotCapacity, 1, 10000)
        || !/^\d{4}-\d{2}-\d{2}$/.test(identity.reservationDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(identity.reservationTime)) throw new Error('INVALID_FIXTURE_CONTRACT');
    instant(identity.reservationDate + 'T00:00:00Z');
    const issued = instant(identity.issuedAt), expires = instant(identity.expiresAt);
    if (issued > now + 30_000 || expires <= now || expires <= issued || expires - issued > LIMITS.fixtureTtlSeconds * 1000) throw new Error('FIXTURE_EXPIRED_OR_INVALID');
    return identity;
}
export function validateAttestation(value, origin, now = Date.now()) {
    keys(value, ['schemaVersion', 'identity']);
    if (value.schemaVersion !== 1) throw new Error('INVALID_FIXTURE_CONTRACT');
    return validateIdentity(value.identity, origin, now);
}
export function assertIdentity(expected, observed, now = Date.now()) {
    validateIdentity(expected, expected.origin, now);
    validateIdentity(observed, expected.origin, now);
    if (canonical(expected) !== canonical(observed)) throw new Error('FIXTURE_IDENTITY_MISMATCH');
}
export function validateCookies(value, identity, minimumAccounts, now = Date.now()) {
    keys(value, ['schemaVersion', 'purpose', 'fixtureId', 'nonce', 'origin', 'expiresAt', 'accounts']);
    if (value.schemaVersion !== 1 || value.purpose !== FIXTURE_KIND || value.fixtureId !== identity.fixtureId || value.nonce !== identity.nonce
        || value.origin !== identity.origin || value.expiresAt !== identity.expiresAt || instant(value.expiresAt) <= now
        || !Array.isArray(value.accounts) || value.accounts.length < minimumAccounts || value.accounts.length > LIMITS.vus) throw new Error('SYNTHETIC_COOKIES_REQUIRED');
    const tokens = new Set();
    for (const account of value.accounts) {
        keys(account, ['synthetic', 'cookies']);
        keys(account.cookies, ['access_token']);
        const token = account.cookies.access_token;
        if (account.synthetic !== true || typeof token !== 'string' || !/^[A-Za-z0-9._~-]{20,8192}$/.test(token) || tokens.has(token)) throw new Error('SYNTHETIC_COOKIES_REQUIRED');
        tokens.add(token);
    }
    return value;
}
export function validatePlan(value, identity, now = Date.now()) {
    keys(value, ['origin', 'scenario', 'rate', 'durationSeconds', 'vus']);
    if (!SCENARIOS.includes(value.scenario) || !integer(value.rate, 1, LIMITS.rate) || !integer(value.durationSeconds, 5, LIMITS.durationSeconds)
        || !integer(value.vus, 1, LIMITS.vus) || parseOrigin(value.origin) !== identity.origin) throw new Error('INVALID_LOAD_PLAN');
    if (instant(identity.expiresAt) - now < (value.durationSeconds + LIMITS.waitSeconds + 30) * 1000) throw new Error('FIXTURE_TTL_TOO_SHORT');
    return value;
}
export function campaignPath(identity) {
    return '/api/reservations/admission?storeId=' + identity.storeId + '&date=' + identity.reservationDate + '&time=' + encodeURIComponent(identity.reservationTime);
}
export function reservationPayload(identity, ticket, requestId) {
    if (!UUID.test(ticket) || !UUID.test(requestId)) throw new Error('INVALID_SYNTHETIC_TICKET');
    return { storeId: identity.storeId, reservationDate: identity.reservationDate, reservationTime: identity.reservationTime, guestCount: 1, specialRequest: null, skipPayment: false, requestId, admissionTicket: ticket };
}
export function parseStatus(value, identity, cancel = false) {
    if (!plain(value) || value.campaignId !== identity.campaignId || !STATES.includes(value.state) || (!cancel && value.state === 'CANCELLED')
        || !Number.isSafeInteger(value.position) || value.position < 0 || !Number.isSafeInteger(value.expiresAt) || value.expiresAt < 0
        || !Number.isSafeInteger(value.serverTime) || value.serverTime < 0 || value.pollAfterSeconds !== LIMITS.pollSeconds
        || (['WAITING', 'ADMITTED', 'CLAIMED', 'CONSUMED'].includes(value.state) && !UUID.test(value.ticket))) throw new Error('INVALID_ADMISSION_RESPONSE');
    return { campaignId: value.campaignId, state: value.state, ticket: typeof value.ticket === 'string' && UUID.test(value.ticket) ? value.ticket : null, position: value.position, expiresAt: value.expiresAt, serverTime: value.serverTime, pollAfterSeconds: value.pollAfterSeconds };
}
export function buildOptions(plan, identity) {
    const scenario = { executor: 'constant-arrival-rate', rate: plan.rate, timeUnit: '1s', duration: plan.durationSeconds + 's', preAllocatedVUs: plan.vus, maxVUs: plan.vus, gracefulStop: (LIMITS.waitSeconds + 10) + 's' };
    return {
        scenarios: { [plan.scenario.replace(/-/g, '_')]: { ...scenario, exec: plan.scenario === 'queue-open' ? 'queueOpen' : plan.scenario === 'queue-status' ? 'queueStatus' : 'bookingIdempotency' } },
        maxRedirects: 0, noConnectionReuse: false, batch: 2, batchPerHost: 2,
        setupTimeout: '60s', teardownTimeout: '30s',
        summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)'],
        systemTags: ['method', 'status', 'name', 'scenario', 'expected_response'],
        thresholds: {
            http_req_duration: ['p(95)<' + PROVISIONAL_TARGETS.httpP95Ms, 'p(99)<' + PROVISIONAL_TARGETS.httpP99Ms],
            unexpected_responses: ['rate<' + PROVISIONAL_TARGETS.unexpectedErrorRate],
            dropped_iterations: ['count==0'],
            idempotency_mismatches: ['count==0'],
            reservations_unique_observed: ['count<=' + identity.slotCapacity],
            queue_wait_ms: ['p(95)<' + PROVISIONAL_TARGETS.queueWaitP95Ms],
        },
    };
}
