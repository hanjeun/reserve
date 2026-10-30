import http from 'k6/http';
import exec from 'k6/execution';
import crypto from 'k6/crypto';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
    assertIdentity, buildOptions, campaignPath, IDENTITY_PATH, LIMITS, parseStatus, PROVISIONAL_TARGETS,
    reservationPayload, STATES, validateAttestation, validateCookies, validateIdentity, validatePlan,
} from './reservation-admission-contract.mjs';

if (__ENV.RESERVE_LOAD_APPROVED !== 'synthetic-only' || __ENV.RESERVE_LOAD_RUNNER_VERIFIED !== '1') throw new Error('SAFE_RUNNER_REQUIRED');
let plan, identity, accounts;
try {
    if (!__ENV.RESERVE_LOAD_PLAN || __ENV.RESERVE_LOAD_PLAN.length > 512) throw new Error('invalid plan');
    plan = JSON.parse(__ENV.RESERVE_LOAD_PLAN);
    const attestation = open(__ENV.RESERVE_LOAD_ATTESTATION);
    const cookieFile = open(__ENV.RESERVE_LOAD_COOKIE_FILE);
    if (crypto.sha256(attestation, 'hex') !== __ENV.RESERVE_LOAD_ATTESTATION_SHA256 || crypto.sha256(cookieFile, 'hex') !== __ENV.RESERVE_LOAD_COOKIE_SHA256) throw new Error('changed private inputs');
    identity = validateAttestation(JSON.parse(attestation), plan.origin);
    validatePlan(plan, identity);
    accounts = validateCookies(JSON.parse(cookieFile), identity, plan.vus).accounts;
} catch { throw new Error('INVALID_OR_CHANGED_PRIVATE_FIXTURE'); }

export const options = buildOptions(plan, identity);
const joinLatency = new Trend('join_latency_ms', true);
const statusLatency = new Trend('status_latency_ms', true);
const bookingLatency = new Trend('booking_latency_ms', true);
const pairLatency = new Trend('idempotency_pair_ms', true);
const queueWait = new Trend('queue_wait_ms', true);
const unexpected = new Rate('unexpected_responses');
const requests = new Counter('requests_completed');
const iterations = new Counter('iterations_completed');
const admitted = new Counter('queue_admitted');
const censored = new Counter('queue_wait_censored');
const confirmed = new Counter('booking_confirmed_pairs');
const rejected = new Counter('booking_rejected_pairs');
const unverifiedPairs = new Counter('idempotency_unverified_pairs');
const mismatches = new Counter('idempotency_mismatches');
const unique = new Counter('reservations_unique_observed');
const stateCounters = {};
for (const state of STATES) stateCounters[state] = new Counter('state_' + state.toLowerCase());
let lastPoll = 0;
let lastIdentityCheck = 0;
let booking = null;

function assertCurrent() {
    try { validateIdentity(identity, plan.origin); }
    catch { exec.test.abort('SYNTHETIC_FIXTURE_EXPIRED'); }
}
function params(account, name) {
    assertCurrent();
    const jar = new http.CookieJar();
    if (account) jar.set(plan.origin, 'access_token', account.cookies.access_token, { path: '/' });
    return {
        redirects: 0, timeout: '5s', responseType: 'text', jar,
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
        tags: { name },
    };
}
function liveIdentity() {
    const response = http.get(plan.origin + IDENTITY_PATH, params(null, 'fixture_identity'));
    try {
        if (response.status !== 200 || response.body.length > LIMITS.responseBytes) throw new Error('missing identity');
        assertIdentity(identity, JSON.parse(response.body));
        lastIdentityCheck = Date.now();
    } catch { exec.test.abort('SYNTHETIC_FIXTURE_IDENTITY_MISMATCH'); }
}
function accountForVu() {
    assertCurrent();
    const index = exec.vu.idInTest - 1;
    if (index < 0 || index >= plan.vus || index >= accounts.length) exec.test.abort('UNIQUE_SYNTHETIC_ACCOUNT_REQUIRED');
    if (Date.now() - lastIdentityCheck > 10000) liveIdentity();
    return accounts[index];
}
function data(response, latency, conflict = false) {
    requests.add(1);
    if (latency && Number.isFinite(response.timings.duration)) latency.add(response.timings.duration);
    if (response.status === 401 || response.status === 403) exec.test.abort('SYNTHETIC_AUTH_UNAVAILABLE');
    const accepted = response.status === 200 || response.status === 201 || (conflict && response.status === 409);
    let body = null;
    try {
        if (response.body.length > 65536) throw new Error('oversized response');
        body = JSON.parse(response.body);
    } catch { unexpected.add(true); return null; }
    if (!accepted || (response.status !== 409 && body.success !== true)) { unexpected.add(true); return null; }
    unexpected.add(false);
    return { status: response.status, value: body.data };
}
function status(response, cancel = false, latency = statusLatency) {
    const body = data(response, latency);
    if (!body || body.status !== 200) return null;
    try {
        const result = parseStatus(body.value, identity, cancel);
        stateCounters[result.state].add(1);
        return result;
    } catch { unexpected.add(true); return null; }
}
function join(account) {
    return status(http.post(plan.origin + '/api/reservations/admission/' + identity.campaignId, null, params(account, 'admission_join')), false, joinLatency);
}
function poll(account, ticket) {
    // VU·계정마다 서버의 4초 조회 간격을 지켜요.
    const remaining = LIMITS.pollSeconds * 1000 - (Date.now() - lastPoll);
    if (remaining > 0) sleep(remaining / 1000);
    assertCurrent();
    lastPoll = Date.now();
    return status(http.post(plan.origin + '/api/reservations/admission/' + identity.campaignId + '/status', JSON.stringify({ ticket }), params(account, 'admission_status')));
}
function cancel(account, ticket) {
    if (!ticket) return;
    return status(http.request('DELETE', plan.origin + '/api/reservations/admission/' + identity.campaignId, JSON.stringify({ ticket }), params(account, 'admission_cancel')), true);
}
function waitForAdmission(account) {
    const started = Date.now();
    let current = join(account);
    lastPoll = started;
    while (current?.state === 'WAITING' && Date.now() - started < LIMITS.waitSeconds * 1000) current = poll(account, current.ticket);
    if (current?.state === 'ADMITTED') {
        admitted.add(1);
        queueWait.add(Date.now() - started);
    } else if (current?.state === 'WAITING') censored.add(1);
    return current;
}
function uuid() {
    const bytes = new Uint8Array(crypto.randomBytes(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
export function setup() {
    liveIdentity();
    mismatches.add(0);
    unique.add(0);
    const campaignResponse = data(http.get(plan.origin + campaignPath(identity), params(accounts[0], 'admission_campaign')), null);
    const campaign = campaignResponse?.value;
    const opensAt = Date.parse(campaign?.opensAt), closesAt = Date.parse(campaign?.closesAt);
    const now = Date.now();
    if (!campaign || campaign.id !== identity.campaignId || !Number.isFinite(opensAt) || !Number.isFinite(closesAt)
        || campaign.leaseSeconds < 30 || campaign.leaseSeconds > 600 || closesAt < now + (plan.durationSeconds + LIMITS.waitSeconds) * 1000
        || (plan.scenario === 'queue-open' ? opensAt < now - 60000 || opensAt > now + 15000 : opensAt > now)) exec.test.abort('SYNTHETIC_CAMPAIGN_WINDOW_MISMATCH');
    if (plan.scenario !== 'queue-status') return { tickets: [] };
    const tickets = [];
    for (let i = 0; i < plan.vus; i++) {
        const current = join(accounts[i]);
        if (!current?.ticket || !['WAITING', 'ADMITTED'].includes(current.state)) exec.test.abort('SYNTHETIC_STATUS_TICKETS_UNAVAILABLE');
        tickets.push({ ticket: current.ticket, joinedAt: Date.now() });
    }
    return { tickets };
}
export function queueOpen() {
    const account = accountForVu();
    let current;
    try { current = waitForAdmission(account); }
    finally { if (current?.ticket) cancel(account, current.ticket); }
    iterations.add(1);
}
export function queueStatus(context) {
    const account = accountForVu();
    const entry = context.tickets[exec.vu.idInTest - 1];
    if (!entry?.ticket) exec.test.abort('SYNTHETIC_STATUS_TICKET_MISSING');
    lastPoll = Math.max(lastPoll, entry.joinedAt);
    poll(account, entry.ticket);
    iterations.add(1);
}
export function bookingIdempotency() {
    const account = accountForVu();
    if (!booking) {
        const current = waitForAdmission(account);
        if (current?.state !== 'ADMITTED') {
            if (current?.ticket) cancel(account, current.ticket);
            unverifiedPairs.add(1);
            iterations.add(1);
            return;
        }
        booking = { payload: reservationPayload(identity, current.ticket, uuid()), observedId: null };
    }
    const body = JSON.stringify(booking.payload);
    const started = Date.now();
    const responses = http.batch([
        { method: 'POST', url: plan.origin + '/api/reservations', body, params: params(account, 'reservation_create') },
        { method: 'POST', url: plan.origin + '/api/reservations', body, params: params(account, 'reservation_create') },
    ]);
    pairLatency.add(Date.now() - started);
    const results = responses.map(response => data(response, bookingLatency, true));
    const successful = results.filter(result => result?.status === 201 && Number.isSafeInteger(result.value?.id) && result.value.id > 0);
    if (successful.length === 2 && successful[0].value.id === successful[1].value.id && (booking.observedId === null || booking.observedId === successful[0].value.id)) {
        if (booking.observedId === null) { unique.add(1); booking.observedId = successful[0].value.id; }
        confirmed.add(1);
    } else if (results.every(result => result?.status === 409)) { rejected.add(1); unverifiedPairs.add(1); }
    else { mismatches.add(1); unexpected.add(true); }
    iterations.add(1);
}
export function teardown(context) {
    if (plan.scenario !== 'queue-status') return;
    for (let i = 0; i < (context?.tickets ?? []).length; i++) cancel(accounts[i], context.tickets[i].ticket);
}
export function handleSummary(summary) {
    const metrics = {};
    const allowed = [
        'http_req_duration', 'http_req_failed', 'http_reqs', 'iterations', 'dropped_iterations',
        'join_latency_ms', 'status_latency_ms', 'booking_latency_ms', 'idempotency_pair_ms', 'queue_wait_ms',
        'unexpected_responses', 'requests_completed', 'iterations_completed', 'queue_admitted', 'queue_wait_censored',
        'booking_confirmed_pairs', 'booking_rejected_pairs', 'idempotency_unverified_pairs', 'idempotency_mismatches', 'reservations_unique_observed',
        ...STATES.map(state => 'state_' + state.toLowerCase()),
    ];
    for (const name of allowed) if (summary.metrics[name]) metrics[name] = summary.metrics[name].values;
    const dropped = metrics.dropped_iterations?.count;
    const completed = metrics.iterations_completed?.count ?? 0;
    const samples = plan.scenario === 'booking-idempotency' ? metrics.booking_confirmed_pairs?.count ?? 0
        : plan.scenario === 'queue-open' ? metrics.queue_admitted?.count ?? 0 : metrics.requests_completed?.count ?? 0;
    let thresholds = 0, thresholdsPassed = true;
    for (const metric of Object.values(summary.metrics)) for (const result of Object.values(metric.thresholds ?? {})) { thresholds++; thresholdsPassed &&= result.ok === true; }
    return {
        stdout: 'RESERVE_LOAD_SUMMARY ' + JSON.stringify({
            schemaVersion: 1, scenario: plan.scenario, measurementStatus: completed > 0 && samples > 0 && dropped === 0 ? 'MEASURED' : 'INCOMPLETE',
            provisionalTargets: PROVISIONAL_TARGETS, metrics, thresholdsPassed: thresholds > 0 && thresholdsPassed,
        }) + '\n',
    };
}
