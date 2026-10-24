import { assertCurrentSession, currentSession } from './sessionScope';
import { canonicalApiPath } from './apiVersion';

const listeners = new Set();
const waiters = new Set();
let scope = currentSession().epoch;
let blocked = new Set();
let pending = false;
let reason = null;
const keyOf = config => `${(config.method || 'get').toUpperCase()} ${canonicalApiPath(config.url)}`;

export class ServiceAdmissionRequiredError extends Error {
    constructor(message = '입장 후 다시 시도해주세요.') {
        super(message);
        this.name = 'ServiceAdmissionRequiredError';
        this.isServiceAdmissionRequired = true;
    }
}

function align(epoch) {
    assertCurrentSession(epoch);
    if (scope === epoch) return;
    for (const waiter of [...waiters]) waiter.reject(new ServiceAdmissionRequiredError('계정이 변경되어 입장 확인을 취소했어요.'));
    scope = epoch;
    blocked = new Set();
    pending = false;
    reason = null;
}

export function observeServiceAdmission(config, data) {
    align(config._sessionEpoch);
    if (!['SERVICE_ADMISSION_REQUIRED', 'SERVICE_ADMISSION_UNAVAILABLE'].includes(data?.code)) return false;
    blocked.add(keyOf(config));
    pending = true;
    reason = data;
    listeners.forEach(listener => listener(data));
    return true;
}

export function subscribeServiceAdmission(epoch, listener) {
    align(epoch);
    listeners.add(listener);
    if (pending) listener(reason);
    return () => listeners.delete(listener);
}

export function isServiceAdmissionBlocked(config) {
    align(config._sessionEpoch);
    return pending && blocked.has(keyOf(config));
}

export function notifyServiceAdmission(config) {
    align(config._sessionEpoch);
    if (pending) listeners.forEach(listener => listener(reason));
}

export function waitForServiceAdmission(epoch, signal) {
    align(epoch);
    if (!pending) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const finish = error => {
            signal?.removeEventListener('abort', aborted);
            waiters.delete(waiter);
            if (error) reject(error); else resolve();
        };
        const aborted = () => finish(new DOMException('입장 확인을 중단했어요.', 'AbortError'));
        const waiter = { resolve: () => finish(), reject: finish };
        if (signal?.aborted) { aborted(); return; }
        signal?.addEventListener('abort', aborted, { once: true });
        waiters.add(waiter);
    });
}

export function completeServiceAdmission(epoch) {
    align(epoch);
    pending = false;
    blocked.clear();
    reason = null;
    for (const waiter of [...waiters]) waiter.resolve();
}

export function cancelServiceAdmission(epoch) {
    align(epoch);
    pending = false;
    blocked.clear();
    reason = null;
    for (const waiter of [...waiters]) waiter.reject(new ServiceAdmissionRequiredError('입장 대기를 취소했어요.'));
}
