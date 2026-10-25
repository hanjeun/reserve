import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from './axios';
import { advanceSession, currentSession } from './sessionScope';
import { observeServiceAdmission, subscribeServiceAdmission, completeServiceAdmission, cancelServiceAdmission,
    isServiceAdmissionBlocked, waitForServiceAdmission } from './serviceAdmissionGate';

vi.mock('../utils/skeletonDelay', () => ({ skeletonDelayInterceptor: async () => {} }));
const gate = { code: 'SERVICE_ADMISSION_REQUIRED', mode: 'CORE' };
const ok = (config, data) => ({ status: 200, config, headers: {}, data: { success: true, data } });
const denied = config => Promise.reject({ config, response: { status: 429, data: { success: false, data: gate, message: '입장 대기' } } });
let stop;
beforeEach(() => { advanceSession(); });
afterEach(() => { stop?.(); stop = null; cancelServiceAdmission(currentSession().epoch); vi.unstubAllEnvs(); });

describe('service entry HTTP boundary', () => {
    it.each(['', 'v1'])('never replays a rejected mutation, including repeated clicks (%s)', async version => {
        vi.stubEnv('VITE_API_VERSION', version);
        const listener = vi.fn();
        stop = subscribeServiceAdmission(currentSession().epoch, listener);
        const adapter = vi.fn(denied);
        api.defaults.adapter = adapter;
        await expect(api.post('/api/reservations', { form: 'kept by caller' })).rejects.toMatchObject({ isServiceAdmissionRequired: true });
        await expect(api.post('/api/reservations', { form: 'second click' })).rejects.toMatchObject({ isServiceAdmissionRequired: true });
        expect(adapter).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledTimes(2);
        completeServiceAdmission(currentSession().epoch);
        expect(adapter).toHaveBeenCalledTimes(1);
        api.defaults.adapter = config => Promise.resolve(ok(config, 'explicitly submitted'));
        expect(await api.post('/api/reservations', {})).toBe('explicitly submitted');
    });

    it('resumes a rejected GET once, after entry, without changing its request data', async () => {
        const observed = vi.fn();
        stop = subscribeServiceAdmission(currentSession().epoch, observed);
        const calls = [];
        api.defaults.adapter = config => {
            calls.push(config);
            return calls.length === 1 ? denied(config) : Promise.resolve(ok(config, 'stores'));
        };
        const request = api.get('/api/stores', { params: { page: 2 } });
        await vi.waitFor(() => expect(observed).toHaveBeenCalledOnce());
        expect(calls).toHaveLength(1);
        completeServiceAdmission(currentSession().epoch);
        expect(await request).toBe('stores');
        expect(calls).toHaveLength(2);
        expect(calls[1].params).toEqual({ page: 2 });
        expect(calls[1]._serviceAdmissionRetry).toBe(true);
    });

    it('does not loop if the server rejects the resumed read again', async () => {
        const listener = vi.fn();
        stop = subscribeServiceAdmission(currentSession().epoch, listener);
        const adapter = vi.fn(denied);
        api.defaults.adapter = adapter;
        const request = api.get('/api/stores').catch(error => error);
        await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
        completeServiceAdmission(currentSession().epoch);
        expect(await request).toMatchObject({ isServiceAdmissionRequired: true });
        expect(adapter).toHaveBeenCalledTimes(2);
    });

    it('does not intercept ordinary rate limits or its own status endpoint', async () => {
        const listener = vi.fn();
        stop = subscribeServiceAdmission(currentSession().epoch, listener);
        api.defaults.adapter = config => Promise.reject({ config, response: { status: 429, data: { message: 'ordinary limit' } } });
        await expect(api.get('/api/stores')).rejects.toMatchObject({ status: 429, message: 'ordinary limit' });
        api.defaults.adapter = denied;
        await expect(api.get('/api/service-admission')).rejects.toMatchObject({ status: 429 });
        expect(listener).not.toHaveBeenCalled();
    });

    it('keeps payment and unrelated routes usable while a reservation request waits', async () => {
        const config = { method: 'post', url: '/api/reservations', _sessionEpoch: currentSession().epoch };
        observeServiceAdmission(config, gate);
        api.defaults.adapter = config => Promise.resolve(ok(config, 'payment result'));
        expect(await api.get('/api/payment/status/one')).toBe('payment result');
        expect(isServiceAdmissionBlocked({ ...config, method: 'get', url: '/api/member/me' })).toBe(false);
    });

    it('rejects pending reads on cancellation, with no automatic replay', async () => {
        const listener = vi.fn();
        stop = subscribeServiceAdmission(currentSession().epoch, listener);
        const adapter = vi.fn(denied);
        api.defaults.adapter = adapter;
        const request = api.get('/api/stores').catch(error => error);
        await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
        cancelServiceAdmission(currentSession().epoch);
        expect(await request).toMatchObject({ isServiceAdmissionRequired: true });
        expect(adapter).toHaveBeenCalledOnce();
    });

    it('aborts a pending read at account change and cannot replay it under new cookies', async () => {
        const listener = vi.fn();
        stop = subscribeServiceAdmission(currentSession().epoch, listener);
        const adapter = vi.fn(denied);
        api.defaults.adapter = adapter;
        const request = api.get('/api/stores').catch(error => error);
        await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
        advanceSession();
        expect((await request).name).toBe('AbortError');
        completeServiceAdmission(currentSession().epoch);
        expect(adapter).toHaveBeenCalledOnce();
    });

    it('allows an explicit caller abort without dropping the server pass or other waiters', async () => {
        const scope = currentSession().epoch;
        observeServiceAdmission({ url: '/api/stores', method: 'get', _sessionEpoch: scope }, gate);
        const controller = new AbortController();
        const request = waitForServiceAdmission(scope, controller.signal).catch(error => error);
        const second = waitForServiceAdmission(scope);
        controller.abort();
        expect((await request).name).toBe('AbortError');
        completeServiceAdmission(scope);
        await expect(second).resolves.toBeUndefined();
    });
});
