import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from './axios';
import { assertOverloadCooldown, observeOverloadCooldown } from './overloadCooldown';
import { advanceSession, currentSession } from './sessionScope';
import { subscribeServiceAdmission } from './serviceAdmissionGate';

vi.mock('../utils/skeletonDelay', () => ({ skeletonDelayInterceptor: async () => {} }));
const originalAdapter = api.defaults.adapter;
const data = { code: 'SERVICE_ADMISSION_THROTTLED', mode: 'EMERGENCY' };
const response = (overrides = {}) => ({ status: 429, headers: { 'retry-after': '10' },
    data: { success: false, message: '10초 후 다시 시도해주세요.', data }, ...overrides });
const success = config => Promise.resolve({ status: 200, config, headers: {}, data: { success: true, data: 'ok' } });
const config = (url = '/api/stores') => ({ method: 'get', url, _sessionEpoch: currentSession().epoch });
let clock;

beforeEach(() => {
    advanceSession();
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
    advanceSession();
    api.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe('emergency retry cooldown', () => {
    it.each(['', 'v1'])('blocks a repeated write locally and never replays it (%s)', async version => {
        vi.stubEnv('VITE_API_VERSION', version);
        const listener = vi.fn();
        const unsubscribe = subscribeServiceAdmission(currentSession().epoch, listener);
        const adapter = vi.fn(value => Promise.reject({ config: value, response: response() }));
        api.defaults.adapter = adapter;
        try {
            await expect(api.post('/api/reservations', { selection: 1 })).rejects.toMatchObject({ status: 429, retryAfterSeconds: 10 });
            clock += 4000;
            await expect(api.post('/api/reservations', { selection: 2 })).rejects.toMatchObject({ status: 429, retryAfterSeconds: 6,
                isOverloadRateLimited: true, message: expect.stringContaining('6초') });
            expect(adapter).toHaveBeenCalledOnce();
            expect(listener).not.toHaveBeenCalled();
            clock += 6000;
            expect(adapter).toHaveBeenCalledOnce();
            api.defaults.adapter = success;
            expect(await api.post('/api/reservations', { selection: 3 })).toBe('ok');
        } finally { unsubscribe(); }
    });

    it('canonicalizes GET queries but leaves a different method and transaction recovery usable', async () => {
        api.defaults.adapter = vi.fn(value => Promise.reject({ config: value, response: response() }));
        await expect(api.get('/api/stores?page=1')).rejects.toMatchObject({ status: 429 });
        await expect(api.get('/api/stores?page=2')).rejects.toMatchObject({ isOverloadRateLimited: true });
        expect(api.defaults.adapter).toHaveBeenCalledOnce();
        api.defaults.adapter = success;
        expect(await api.post('/api/stores', {})).toBe('ok');
        expect(await api.post('/api/payment/verify', {})).toBe('ok');
        expect(await api.post('/api/auth/refresh')).toBe('ok');
    });

    it('drops the old account cooldown and refuses a stale response', async () => {
        const old = config();
        observeOverloadCooldown(old, response());
        advanceSession();
        api.defaults.adapter = success;
        expect(await api.get('/api/stores')).toBe('ok');
        expect(() => observeOverloadCooldown(old, response())).toThrow('계정이 변경');
    });

    it('does not change ordinary limits, entry limits, or unconfirmed modes', () => {
        for (const entry of [
            { ...response(), status: 503 },
            response({ data: { data: { code: 'SERVICE_ADMISSION_RATE_LIMITED', mode: null } } }),
            response({ data: { data: { ...data, mode: 'CORE' } } }),
        ]) expect(observeOverloadCooldown(config(), entry)).toBeNull();
        expect(() => assertOverloadCooldown(config())).not.toThrow();
    });

    it('bounds retry hints and storage and does not let a later hint shorten the current restriction', () => {
        const initial = config();
        expect(observeOverloadCooldown(initial, response({ headers: { 'Retry-After': '999' } })).retryAfterSeconds).toBe(60);
        clock += 1000;
        expect(observeOverloadCooldown(initial, response({ headers: { 'Retry-After': '1' } })).retryAfterSeconds).toBe(59);
        for (let index = 0; index < 64; index++) observeOverloadCooldown(config(`/api/stores/${index}`), response());
        expect(() => assertOverloadCooldown(initial)).not.toThrow();
        expect(() => assertOverloadCooldown(config('/api/stores/63'))).toThrow('제한됐어요');
        expect(observeOverloadCooldown(config(), response({ headers: { 'retry-after': 'invalid' } })).retryAfterSeconds).toBe(10);
    });
});
