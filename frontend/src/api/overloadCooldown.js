import { canonicalApiPath } from './apiVersion';
import { assertCurrentSession, currentSession } from './sessionScope';

const entries = new Map();
const MAX_ENTRIES = 64;
let epoch = -1;
let signal;
const now = () => globalThis.performance?.now?.() ?? Date.now();
const clear = () => entries.clear();

export class OverloadRateLimitedError extends Error {
    constructor(seconds, message) {
        super(message || `접속자가 많아 요청이 잠시 제한됐어요. ${seconds}초 후 다시 시도해주세요.`);
        this.name = 'OverloadRateLimitedError';
        this.status = 429;
        this.retryAfterSeconds = seconds;
        this.isOverloadRateLimited = true;
        this.data = { code: 'SERVICE_ADMISSION_THROTTLED', mode: 'EMERGENCY' };
    }
}

function key(config) {
    const scope = config._sessionEpoch ?? currentSession().epoch;
    assertCurrentSession(scope);
    if (epoch !== scope) {
        signal?.removeEventListener('abort', clear);
        clear();
        epoch = scope;
        signal = currentSession().signal;
        signal.addEventListener('abort', clear, { once: true });
    }
    const path = canonicalApiPath(config.url);
    return path.startsWith('/api/') && path.length <= 1024
        ? `${(config.method || 'get').toUpperCase()} ${path}` : null;
}

/* 대기 시간에는 요청을 새로 예약하거나 재실행하지 않는다. */
export function assertOverloadCooldown(config) {
    const path = key(config);
    const until = entries.get(path);
    if (until == null) return;
    const remaining = until - now();
    if (remaining <= 0) { entries.delete(path); return; }
    throw new OverloadRateLimitedError(Math.ceil(remaining / 1000));
}

export function observeOverloadCooldown(config, response) {
    const path = key(config);
    if (!path || response?.status !== 429 || response.data?.data?.code !== 'SERVICE_ADMISSION_THROTTLED'
        || response.data.data.mode !== 'EMERGENCY') return null;
    const raw = response.headers?.get?.('Retry-After') ?? response.headers?.['retry-after'] ?? response.headers?.['Retry-After'];
    const seconds = /^\d{1,3}$/.test(String(raw)) ? Math.min(60, Math.max(1, Number(raw))) : 10;
    const observed = now();
    for (const [saved, until] of entries) if (until <= observed) entries.delete(saved);
    // 늦은 이전 응답으로 더 최근의 제한 시간을 줄이지 않는다.
    const until = Math.max(entries.get(path) ?? 0, observed + seconds * 1000);
    entries.delete(path);
    if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value);
    entries.set(path, until);
    return new OverloadRateLimitedError(Math.ceil((until - observed) / 1000), response.data?.message);
}
