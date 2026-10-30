import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './axios';
import { advanceSession, currentSession } from './sessionScope';
import useAuthStore from '../store/useAuthStore';
import chatRetentionService from '../services/chatRetentionService';

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

    it.each([
        { mode: 'legacy', version: '', prefix: '/api' },
        { mode: 'v1', version: 'v1', prefix: '/api/v1' },
    ])('same-session requests share one refresh and retry only once ($mode)', async ({ version, prefix }) => {
        vi.stubEnv('VITE_API_VERSION', version);
        try {
            const refresh = deferred();
            const configs = [];
            api.defaults.adapter = config => {
                configs.push(config);
                if (config.url === `${prefix}/auth/refresh`) return refresh.promise.then(() => response(config, null));
                if (!config._retry) return Promise.reject({ config, response: { status: 401 } });
                return Promise.resolve(response(config, 'fresh'));
            };
            const one = api.get('/api/one'), two = api.get('/api/two');
            await vi.waitFor(() => expect(configs.filter(c => c.url === `${prefix}/auth/refresh`)).toHaveLength(1));
            refresh.resolve();
            expect(await Promise.all([one, two])).toEqual(['fresh', 'fresh']);
            expect(configs.every(c => c._sessionEpoch === currentSession().epoch)).toBe(true);
            expect(configs.filter(c => c.url === `${prefix}/one`)).toHaveLength(2);
            expect(configs.filter(c => c.url === `${prefix}/two`)).toHaveLength(2);
            expect(configs).toHaveLength(5);
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it.each([401, 403])('a protected retry with %s expires only an unauthorized session', async status => {
        const user = { id: 1, email: 'session@example.test', role: 'USER' };
        useAuthStore.getState().login(user);
        const calls = [];
        try {
            api.defaults.adapter = config => {
                calls.push(config.url);
                if (config.url === '/api/auth/refresh') return Promise.resolve(response(config, null));
                return Promise.reject({ config, response: { status: config._retry ? status : 401 } });
            };
            const error = await api.get('/api/chat/unread').catch(failure => failure);
            expect(calls).toEqual(['/api/chat/unread', '/api/auth/refresh', '/api/chat/unread']);
            if (status === 401) {
                expect(error.isSessionExpired).toBe(true);
                expect(useAuthStore.getState().isLoggedIn).toBe(false);
            } else {
                expect(error.status).toBe(403);
                expect(useAuthStore.getState().user).toEqual(user);
            }
        } finally { useAuthStore.getState().logout(); }
    });

    it.each([
        'session-probe-first', 'protected-read-first',
    ])('session probes and protected reads share one pending refresh (%s)', async order => {
        const user = { id: 1, email: 'session@example.test', role: 'USER' };
        useAuthStore.getState().login(user);
        const refresh = deferred();
        const calls = [];
        let fresh = false;
        api.defaults.adapter = config => {
            calls.push(config.url);
            if (config.url === '/api/auth/refresh') return refresh.promise.then(() => {
                fresh = true; return response(config, null);
            });
            if (config.url === '/api/auth/session') return Promise.resolve(response(config, { member: fresh ? user : null, refreshPossible: !fresh }));
            return fresh ? Promise.resolve(response(config, 0)) : Promise.reject({ config, response: { status: 401 } });
        };
        const probe = () => useAuthStore.getState().checkAuth(true, { rethrowTransient: true });
        const read = () => api.get('/api/chat/unread');
        const first = order === 'session-probe-first' ? probe() : read();
        let second;
        try {
            await vi.waitFor(() => expect(calls).toContain('/api/auth/refresh'));
            second = order === 'session-probe-first' ? read() : probe();
            await vi.waitFor(() => {
                expect(calls).toContain('/api/auth/session');
                expect(calls).toContain('/api/chat/unread');
            });
            refresh.resolve();
            const results = await Promise.all([first, second]);
            expect(results).toEqual(order === 'session-probe-first' ? [user, 0] : [0, user]);
            expect(calls.filter(path => path === '/api/auth/refresh')).toHaveLength(1);
        } finally {
            refresh.resolve();
            await Promise.allSettled([first, second]);
            useAuthStore.getState().logout();
        }
    });

    it.each([
        { name: 'connection loss', failure: {}, message: '서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.' },
        { name: 'timeout', failure: { code: 'ECONNABORTED' }, message: '응답이 너무 늦어요. 잠시 후 다시 시도해주세요.' },
        { name: 'server failure', failure: { response: { status: 503, data: { message: 'temporarily unavailable' } } }, message: 'temporarily unavailable' },
        { name: 'rate limit', failure: { response: { status: 429, data: { message: 'retry later' } } }, message: 'retry later' },
    ])('transient refresh $name preserves the login and can recover', async ({ failure, message }) => {
        const user = { id: 1, email: 'session@example.test', role: 'USER' };
        useAuthStore.getState().login(user);
        const scope = currentSession().epoch;
        const configs = [];
        const errors = [];
        const interceptor = api.interceptors.response.use(value => value, error => {
            errors.push(error);
            throw error;
        });
        try {
            api.defaults.adapter = config => {
                configs.push(config);
                return config.url === '/api/auth/session'
                    ? Promise.resolve(response(config, { member: null, refreshPossible: true }))
                    : Promise.reject({ ...failure, config });
            };

            const error = await useAuthStore.getState().checkAuth(true, { rethrowTransient: true })
                .catch(rejection => rejection);

            expect(errors).toHaveLength(1);
            expect(error).toBe(errors[0]);
            expect(error.message).toBe(message);
            expect(error.status).toBe(failure.response?.status);
            expect(error.isSessionExpired).not.toBe(true);
            expect(useAuthStore.getState().user).toEqual(user);
            expect(useAuthStore.getState().isLoggedIn).toBe(true);
            expect(JSON.parse(localStorage.getItem('auth-storage')).state.isLoggedIn).toBe(true);
            expect(currentSession().epoch).toBe(scope);
            expect(configs.map(config => config.url)).toEqual(['/api/auth/session', '/api/auth/refresh']);

            api.defaults.adapter = config => {
                configs.push(config);
                if (config.url === '/api/auth/refresh') return Promise.resolve(response(config, null));
                const refreshed = configs.filter(value => value.url === '/api/auth/refresh').length === 2;
                return Promise.resolve(response(config, { member: refreshed ? user : null, refreshPossible: !refreshed }));
            };
            expect(await useAuthStore.getState().checkAuth(true)).toEqual(user);
            expect(configs.filter(config => config.url === '/api/auth/refresh')).toHaveLength(2);
            expect(currentSession().epoch).toBe(scope);
        } finally {
            api.interceptors.response.eject(interceptor);
            useAuthStore.getState().logout();
        }
    });

    it.each([401, 403])('refresh rejection %s still clears the login without replaying', async status => {
        useAuthStore.getState().login({ id: 1, email: 'session@example.test', role: 'USER' });
        const scope = currentSession().epoch;
        const calls = [];
        try {
            api.defaults.adapter = config => {
                calls.push(config.url);
                return config.url === '/api/auth/session'
                    ? Promise.resolve(response(config, { member: null, refreshPossible: true }))
                    : Promise.reject({ config, response: { status } });
            };

            expect(await useAuthStore.getState().checkAuth(true, { rethrowTransient: true })).toBeNull();
            expect(useAuthStore.getState().user).toBeNull();
            expect(useAuthStore.getState().isLoggedIn).toBe(false);
            expect(JSON.parse(localStorage.getItem('auth-storage')).state.isLoggedIn).toBe(false);
            expect(currentSession().epoch).toBeGreaterThan(scope);
            expect(calls).toEqual(['/api/auth/session', '/api/auth/refresh']);
        } finally {
            useAuthStore.getState().logout();
        }
    });

    it('public read failure never refreshes or changes the current login state', async () => {
        const calls = [];
        localStorage.setItem('auth-storage', 'preserved');
        api.defaults.adapter = config => {
            calls.push(config.url);
            return Promise.reject({ config, response: { status: 401, data: { message: 'public endpoint unavailable' } } });
        };
        await expect(api.get('/api/promotions/public', { skipAuthRefresh: true })).rejects.toMatchObject({ status: 401 });
        expect(calls).toEqual(['/api/promotions/public']);
        expect(localStorage.getItem('auth-storage')).toBe('preserved');
        localStorage.removeItem('auth-storage');
    });

    it('public retention policy failure does not start an authentication flow', async () => {
        const calls = [];
        api.defaults.adapter = config => {
            calls.push(config.url);
            return Promise.reject({ config, response: { status: 401 } });
        };
        await expect(chatRetentionService.policy()).rejects.toMatchObject({ status: 401 });
        expect(calls).toEqual(['/api/chat/retention-policy']);
    });

    it.each(['/privacy', '/terms', '/'])('private expiry clears personal data while staying on public %s', async path => {
        const previousUrl = window.location.href;
        window.history.replaceState({}, '', path);
        useAuthStore.getState().login({ id: 1, email: 'session@example.test', role: 'USER' });
        const scope = currentSession().epoch;
        const calls = [];
        try {
            api.defaults.adapter = config => {
                calls.push(config.url);
                return Promise.reject({ config, response: { status: 401 } });
            };
            await expect(api.get('/api/chat/unread')).rejects.toMatchObject({ isSessionExpired: true });
            expect(calls).toEqual(['/api/chat/unread', '/api/auth/refresh']);
            expect(window.location.pathname).toBe(path);
            expect(useAuthStore.getState().user).toBeNull();
            expect(useAuthStore.getState().isLoggedIn).toBe(false);
            expect(useAuthStore.getState().isLoggingOut).toBe(false);
            expect(currentSession().epoch).toBeGreaterThan(scope);
            expect(JSON.parse(localStorage.getItem('auth-storage')).state.user).toBeNull();
        } finally {
            useAuthStore.getState().expireSession();
            window.history.replaceState({}, '', previousUrl);
        }
    });

    it.each([200, 204])('handles body-free HEAD status %s inside the session boundary', async status => {
        api.defaults.adapter = config => Promise.resolve({ status, headers: {}, config, data: '' });
        expect(await api.head('/api/chat/images/1')).toBeNull();
        const pending = deferred();
        let captured;
        api.defaults.adapter = config => { captured = config; return pending.promise; };
        const request = api.head('/api/chat/images/1').catch(error => error);
        await vi.waitFor(() => expect(captured).toBeDefined());
        advanceSession();
        pending.resolve({ status, headers: {}, config: captured, data: '' });
        expect((await request).isStaleSession).toBe(true);
    });

    it('returns authenticated image blobs without JSON unwrapping and rejects old-session blobs', async () => {
        const blob = new Blob(['photo'], { type: 'image/png' });
        api.defaults.adapter = config => Promise.resolve({ status: 200, headers: {}, config, data: blob });
        expect(await api.get('/api/chat/images/1', { responseType: 'blob' })).toBe(blob);
        const pending = deferred();
        let captured;
        api.defaults.adapter = config => { captured = config; return pending.promise; };
        const request = api.get('/api/chat/images/1', { responseType: 'blob' }).catch(error => error);
        await vi.waitFor(() => expect(captured).toBeDefined());
        advanceSession();
        pending.resolve({ status: 200, headers: {}, config: captured, data: blob });
        expect((await request).isStaleSession).toBe(true);
    });
});
