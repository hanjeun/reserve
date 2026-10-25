import { afterEach, expect, it, vi } from 'vitest';
import api from '../api/axios';
import { advanceSession } from '../api/sessionScope';
import useAuthStore from '../store/useAuthStore';
import searchService from './searchService';

vi.mock('../utils/skeletonDelay', () => ({ skeletonDelayInterceptor: async () => {} }));
const originalAdapter = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = originalAdapter; vi.unstubAllEnvs(); localStorage.removeItem('auth-storage'); });

it('public search 401 never refreshes authentication or changes the current account', async () => {
    vi.stubEnv('VITE_API_VERSION', 'v1'); advanceSession();
    useAuthStore.setState({ user: { id: 7, role: 'USER' }, isLoggedIn: true, sessionRevision: 31 });
    localStorage.setItem('auth-storage', 'preserved');
    const calls = [];
    api.defaults.adapter = config => {
        calls.push(config.url);
        return Promise.reject({ config, response: { status: 401, data: { message: 'public endpoint unavailable' } } });
    };
    await expect(searchService.public('공방', new AbortController().signal)).rejects.toMatchObject({ status: 401 });
    expect(calls).toEqual(['/api/v1/search']);
    expect(useAuthStore.getState()).toMatchObject({ user: { id: 7 }, isLoggedIn: true, sessionRevision: 31 });
    expect(localStorage.getItem('auth-storage')).toBe('preserved');
});
