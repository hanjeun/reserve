import { createHash } from 'node:crypto';

export const ACTIONS = Object.freeze(['reserve.snapshot.v1', 'reserve.verify_counts.v1', 'reserve.alloy_start_once.v1']);
export const READ_ACTIONS = Object.freeze(ACTIONS.slice(0, 2));
export const SHA = /^[a-f0-9]{64}$/;
export const RELEASE = /^[a-f0-9]{40}$/;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function exactKeys(value, keys) {
    if (!plain(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new Error('INVALID_SCHEMA');
}
export function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (plain(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export function instant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new Error('INVALID_TIME');
    const result = Date.parse(value);
    if (!Number.isFinite(result) || new Date(result).toISOString() !== value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')) throw new Error('INVALID_TIME');
    return result;
}
export function parseRequest(raw, now = Date.now()) {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 4096) throw new Error('INVALID_REQUEST');
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error('INVALID_REQUEST'); }
    exactKeys(value, ['schemaVersion', 'action', 'requestId', 'issuedAt', 'ttlSeconds', 'expectedRelease', 'configHash']);
    if (value.schemaVersion !== 1 || !ACTIONS.includes(value.action) || !UUID.test(value.requestId)
        || !RELEASE.test(value.expectedRelease) || !SHA.test(value.configHash)
        || !Number.isInteger(value.ttlSeconds) || value.ttlSeconds < 1 || value.ttlSeconds > 300) throw new Error('INVALID_REQUEST');
    const issued = instant(value.issuedAt);
    if (issued > now + 30_000) throw new Error('REQUEST_FROM_FUTURE');
    if (now >= issued + value.ttlSeconds * 1000) throw new Error('REQUEST_EXPIRED');
    return value;
}
export function validateConfig(value) {
    exactKeys(value, ['schemaVersion', 'enabled', 'readOnly', 'expectedRelease', 'verifierSha256']);
    if (value.schemaVersion !== 1 || typeof value.enabled !== 'boolean' || value.readOnly !== true
        || !RELEASE.test(value.expectedRelease) || !SHA.test(value.verifierSha256)) throw new Error('CONFIG_NOT_READY');
    return value;
}
export function safeReason(error, fallback) {
    const allowed = new Set(['INVALID_SCHEMA', 'INVALID_TIME', 'INVALID_REQUEST', 'REQUEST_FROM_FUTURE', 'REQUEST_EXPIRED',
        'CONFIG_NOT_READY', 'CONFIG_HASH_MISMATCH', 'EXPECTED_RELEASE_MISMATCH', 'REQUEST_ID_REUSE', 'LEDGER_FULL', 'LEDGER_UNAVAILABLE',
        'UNSUPPORTED_RUNTIME', 'SOURCE_UNAVAILABLE', 'SOURCE_CONTRACT_MISMATCH', 'IDENTITY_CHANGED', 'VERIFIER_HASH_MISMATCH', 'VERIFIER_CONTRACT_MISMATCH']);
    return allowed.has(error?.message) ? error.message : fallback;
}
