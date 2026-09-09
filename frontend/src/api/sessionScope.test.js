import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './axios';
import { advanceSession, currentSession } from './sessionScope';

vi.mock('../utils/skeletonDelay', () => ({ skeletonDelayInterceptor: async () => {} }));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const response = (config, data) => ({ status: 200, statusText: 'OK', headers: {}, config, data: { success: true, data } });

describe('HTTP session boundary', () => {
    beforeEach(() => advanceSession());

    it('captures the identity before an async interceptor even starts', async () => {
        const adapter = vi.fn();
        api.defaults.adapter = adapter;
        const request = api.post('/old-action', {}).catch(error => error);
        advanceSession();
        expect((await request).isStaleSession).toBe(true);
        expect(adapter).not.toHaveBeenCalled();
    });

    it('late account A response cannot become data for account B', async () => {
        const pending = deferred();
        let captured;
        api.defaults.adapter = config => { captured = config; return pending.promise; };
        const request = api.get('/private').catch(error => error);
        await vi.waitFor(() => expect(captured).toBeDefined());
        advanceSession();
        pending.resolve(response(captured, { private: 'account A' }));
        expect((await request).isStaleSession).toBe(true);
        expect(captured.signal.aborted).toBe(true);
    });

    it('old 401 cannot refresh or replay under the new cookies', async () => {
        const pending = deferred();
        const calls = [];
        let captured;
        api.defaults.adapter = config => {
            calls.push(config.url); captured = config;
            return pending.promise;
        };
        const request = api.post('/private/write', {}).catch(error => error);
        await vi.waitFor(() => expect(captured).toBeDefined());
        advanceSession();
        pending.reject({ config: captured, response: { status: 401 } });
        expect((await request).isStaleSession).toBe(true);
        expect(calls).toEqual(['/private/write']);
    });

    it('same-session requests share one refresh and retry only once', async () => {
        const refresh = deferred();
        const configs = [];
        api.defaults.adapter = config => {
            configs.push(config);
            if (config.url === '/api/auth/refresh') return refresh.promise.then(() => response(config, null));
            if (!config._retry) return Promise.reject({ config, response: { status: 401 } });
            return Promise.resolve(response(config, 'fresh'));
        };
        const one = api.get('/one'), two = api.get('/two');
        await vi.waitFor(() => expect(configs.filter(c => c.url === '/api/auth/refresh')).toHaveLength(1));
        refresh.resolve();
        expect(await Promise.all([one, two])).toEqual(['fresh', 'fresh']);
        expect(configs.every(c => c._sessionEpoch === currentSession().epoch)).toBe(true);
        expect(configs.filter(c => c.url === '/one')).toHaveLength(2);
    });
});
