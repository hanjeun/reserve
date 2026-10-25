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

it('선택한 검색 필터를 한 요청에만 담고 원문 응답과 구분한다', async () => {
    vi.stubEnv('VITE_API_VERSION', 'v1'); advanceSession();
    const calls = [];
    api.defaults.adapter = config => {
        calls.push(config);
        return Promise.resolve({ config, status: 200, headers: {}, data: { success: true,
            data: { keyword: '강남 공방', groups: ['stores', 'benefits', 'feed'].map(key => ({ key, items: [], hasMore: false, error: null })) } } });
    };
    const cancellation = new AbortController(); const signal = cancellation.signal;
    const result = await searchService.public('강남 공방', signal, { scope: 'stores', term: '공방', region: '서울 강남구' });
    expect(calls).toHaveLength(1); expect(calls[0].url).toBe('/api/v1/search');
    expect(calls[0].params).toEqual({ keyword: '강남 공방', limit: 5, scope: 'stores', term: '공방', region: '서울 강남구' });
    expect(calls[0].signal.aborted).toBe(false);
    cancellation.abort(); expect(calls[0].signal.aborted).toBe(true);
    expect(result.keyword).toBe('강남 공방');
});
