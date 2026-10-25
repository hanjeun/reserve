import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useUnifiedSearch, { unifiedSearchKeys } from '../useUnifiedSearch';
import useAuthStore from '../../store/useAuthStore';
import searchService from '../../services/searchService';

vi.mock('../../services/searchService', () => ({ default: { public: vi.fn(), personal: vi.fn() } }));
const publicResult = { keyword: '카페', groups: [{ key: 'stores', items: [{ id: 3, title: '공개 가게', path: '/store/3' }] }] };
const personalResult = title => ({ keyword: '카페', groups: [{ key: 'messages', items: [{ id: 4, title, path: '/messages?storeId=3' }] }] });
const guest = { user: null, isLoggedIn: false, authRestoring: false, isLoggingOut: false, sessionRevision: 31 };
const login = (id = 7, revision = 31) => useAuthStore.setState({ ...guest, user: { id, role: 'USER', termsAgreed: true }, isLoggedIn: true, sessionRevision: revision });
const committed = keyword => ({ keyword, submittedKeyword: keyword, confirmed: true });
const clients = new Set();
function setup(props = committed('카페'), options = {}) {
    const client = options.client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    clients.add(client);
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { client, ...renderHook(value => useUnifiedSearch(value), { wrapper, initialProps: props, reactStrictMode: options.strict ?? false }) };
}

describe('explicit unified search scope and cancellation', () => {
    beforeEach(() => {
        vi.clearAllMocks(); useAuthStore.setState(guest);
        searchService.public.mockResolvedValue(publicResult);
        searchService.personal.mockResolvedValue(personalResult('내 대화'));
    });
    afterEach(() => { clients.forEach(client => client.clear()); clients.clear(); vi.useRealTimers(); focusManager.setFocused(undefined); onlineManager.setOnline(true); });
    it('makes no API calls or character-specific queries while typing, clearing or composing', async () => {
        login();
        const view = setup({ keyword: '' });
        for (const keyword of ['카', '카페', '', '공', '공방']) view.rerender({ keyword, composing: true });
        view.rerender({ keyword: '공방', composing: false });
        await act(async () => { await Promise.resolve(); });
        expect(searchService.public).not.toHaveBeenCalled(); expect(searchService.personal).not.toHaveBeenCalled();
        expect(view.client.getQueryCache().getAll().map(query => query.queryKey.at(-1))).toEqual([null, null]);
        expect(view.result.current.remoteConfirmed).toBe(false);
    });
    it('issues one public and one personal read only after explicit confirmation and deduplicates repeated submit', async () => {
        login();
        const view = setup({ keyword: '카페' });
        expect(searchService.public).not.toHaveBeenCalled();
        view.rerender(committed('카페'));
        await waitFor(() => expect(view.result.current.personalData).toBeDefined());
        view.rerender(committed('카페'));
        expect(searchService.public).toHaveBeenCalledTimes(1); expect(searchService.personal).toHaveBeenCalledTimes(1);
    });
    it.each([{}, { isLoggedIn: true, user: { id: 7 }, authRestoring: true }, { isLoggedIn: true, user: { id: 7, termsAgreed: false } }])('does not request or expose personal results without settled authorization: %j', async patch => {
        useAuthStore.setState(patch);
        const view = setup();
        await waitFor(() => expect(view.result.current.publicData).toEqual(publicResult));
        expect(searchService.personal).not.toHaveBeenCalled(); expect(view.result.current.personalData).toBeUndefined();
    });
    it('cancels obsolete reads, hides their late response and never reactivates an old word just by typing it', async () => {
        login(); let finish;
        searchService.public.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const view = setup();
        await waitFor(() => expect(searchService.public).toHaveBeenCalledTimes(1));
        const signal = searchService.public.mock.calls[0][1];
        view.rerender({ keyword: '공방', submittedKeyword: '카페', confirmed: false });
        expect(signal.aborted).toBe(true);
        await act(async () => { finish(publicResult); });
        view.rerender({ keyword: '카페', submittedKeyword: '카페', confirmed: false });
        expect(view.result.current.publicData).toBeUndefined(); expect(view.result.current.personalData).toBeUndefined();
        expect(searchService.public).toHaveBeenCalledTimes(1);
    });
    it('reuses a fresh public result on a later confirmation while personal data remains gc zero', async () => {
        login(); const view = setup();
        await waitFor(() => expect(view.result.current.personalData).toBeDefined());
        view.rerender({ keyword: '', submittedKeyword: '', confirmed: false });
        await waitFor(() => expect(view.client.getQueryData(unifiedSearchKeys.personal(7, 31, '카페'))).toBeUndefined());
        view.rerender(committed('카페'));
        await waitFor(() => expect(searchService.personal).toHaveBeenCalledTimes(2));
        expect(searchService.public).toHaveBeenCalledTimes(1);
    });
    it('shares one in-flight public read across observers and keeps it alive for the remaining observer', async () => {
        let finish;
        searchService.public.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const first = setup(); const second = setup(committed('카페'), { client: first.client });
        await waitFor(() => expect(searchService.public).toHaveBeenCalledTimes(1));
        const signal = searchService.public.mock.calls[0][1];
        first.rerender({ keyword: '공방', confirmed: false });
        expect(signal.aborted).toBe(false);
        await act(async () => { finish(publicResult); });
        await waitFor(() => expect(second.result.current.publicData).toEqual(publicResult));
        expect(first.result.current.publicData).toBeUndefined();
    });
    it('does not duplicate a confirmed URL read during root StrictMode setup', async () => {
        login(); const view = setup(committed('카페'), { strict: true });
        await waitFor(() => expect(view.result.current.personalData).toBeDefined());
        expect(searchService.public).toHaveBeenCalledTimes(1); expect(searchService.personal).toHaveBeenCalledTimes(1);
    });
    it('uses local exact navigation aliases without remote reads but preserves remote substring search', async () => {
        login(); const view = setup(committed('내가 예약한'));
        await act(async () => { await Promise.resolve(); });
        expect(view.result.current.localOnly).toBe(true);
        expect(view.result.current.catalog).toEqual(expect.arrayContaining([expect.objectContaining({ path: '/my-reservations' })]));
        expect(searchService.public).not.toHaveBeenCalled(); expect(searchService.personal).not.toHaveBeenCalled();
        view.rerender(committed('예약'));
        await waitFor(() => expect(searchService.personal).toHaveBeenCalledTimes(1));
        expect(searchService.public).toHaveBeenCalledTimes(1);
    });
    it('partitions owners and rejects late responses after an account switch or logout', async () => {
        login(); let finishOld;
        searchService.personal.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
        const view = setup();
        await waitFor(() => expect(searchService.personal).toHaveBeenCalledTimes(1));
        const oldSignal = searchService.personal.mock.calls[0][1];
        act(() => login(8, 32));
        expect(oldSignal.aborted).toBe(true);
        await waitFor(() => expect(view.result.current.personalData).toEqual(personalResult('내 대화')));
        await act(async () => { finishOld(personalResult('이전 계정의 대화')); });
        expect(view.result.current.personalData.groups[0].items[0].title).toBe('내 대화');
        expect(view.client.getQueriesData({ queryKey: ['unified-search', 'personal', 7, 31] })).toEqual([]);
        act(() => useAuthStore.setState({ ...guest, sessionRevision: 33 }));
        expect(view.result.current.personalData).toBeUndefined();
        expect(view.client.getQueriesData({ queryKey: ['unified-search', 'personal', 8, 32] })).toEqual([]);
    });
    it.each([{ status: 403 }, { isInvalidSearchResponse: true }])('removes denied or mismatched personal cache immediately and keeps public results usable: %j', async failure => {
        login(); const view = setup();
        await waitFor(() => expect(view.result.current.personalData).toBeDefined());
        searchService.personal.mockRejectedValueOnce(Object.assign(new Error('denied or mismatched'), failure));
        await act(async () => { await view.result.current.personalQuery.refetch(); });
        await waitFor(() => expect(view.result.current.personalQuery.error).toMatchObject(failure));
        expect(view.result.current.personalData).toBeUndefined();
        expect(view.client.getQueryData(unifiedSearchKeys.personal(7, 31, '카페'))).toBeUndefined();
        expect(view.result.current.publicData).toEqual(publicResult);
    });
    it('does not auto retry, refetch on focus, or reconnect after a failed confirmation', async () => {
        searchService.public.mockRejectedValue(Object.assign(new Error('offline'), { status: 503 }));
        const view = setup();
        await waitFor(() => expect(view.result.current.publicQuery.isError).toBe(true));
        act(() => { focusManager.setFocused(false); focusManager.setFocused(true); onlineManager.setOnline(false); onlineManager.setOnline(true); });
        await act(async () => { await Promise.resolve(); });
        expect(searchService.public).toHaveBeenCalledTimes(1);
    });
    it('keeps same-owner cached data during a network error and retains an explicit retry error', async () => {
        login(); const view = setup();
        await waitFor(() => expect(view.result.current.personalData).toBeDefined());
        searchService.personal.mockRejectedValue(Object.assign(new Error('offline'), { status: 503 }));
        await act(async () => { await view.result.current.personalQuery.refetch(); });
        await waitFor(() => expect(view.result.current.personalQuery.isError).toBe(true));
        expect(view.result.current.personalData).toEqual(personalResult('내 대화')); expect(view.result.current.publicData).toEqual(publicResult);
    });
    it('never sends an oversized keyword and releases private cache after unmount', async () => {
        login(); const view = setup();
        await waitFor(() => expect(view.result.current.personalData).toBeDefined());
        view.rerender(committed('가'.repeat(101)));
        expect(view.result.current.valid).toBe(false); expect(view.result.current.personalData).toBeUndefined();
        expect(searchService.personal).toHaveBeenCalledTimes(1);
        view.unmount();
        await waitFor(() => expect(view.client.getQueriesData({ queryKey: ['unified-search', 'personal', 7, 31] })).toEqual([]));
    });
    it('keeps identical local store-menu suggestions during Hangul composition and retyping without remote reads', async () => {
        login();
        const view = setup({ keyword: '가게', composing: true });
        const paths = () => view.result.current.catalog.map(item => item.path);
        const initial = paths();
        expect(initial).toContain('/stores');
        view.rerender({ keyword: '가', composing: true });
        view.rerender({ keyword: '가게', composing: true });
        expect(paths()).toEqual(initial);
        view.rerender({ keyword: '가게', composing: false });
        expect(paths()).toEqual(initial);
        await act(async () => { await Promise.resolve(); });
        expect(searchService.public).not.toHaveBeenCalled(); expect(searchService.personal).not.toHaveBeenCalled();
        expect(view.result.current.remoteConfirmed).toBe(false);
    });

    it('모호한 날짜 검색은 선택 전 원격 요청을 만들지 않는다', async () => {
        login(); const view = setup(committed('내일 예약'));
        await act(async () => { await Promise.resolve(); });
        expect(view.result.current.awaitingChoice).toBe(true);
        expect(searchService.public).not.toHaveBeenCalled(); expect(searchService.personal).not.toHaveBeenCalled();
        view.rerender({ ...committed('내일 예약'), choice: 'reservations', submittedAt: Date.parse('2026-10-25T15:01:00Z') });
        await waitFor(() => expect(searchService.personal).toHaveBeenCalledOnce());
        expect(searchService.personal.mock.calls[0][3]).toMatchObject({ scope: 'reservations', term: '', date: '2026-10-27' });
        expect(searchService.public).not.toHaveBeenCalled();
    });
    it('지역 의도는 공개 가게 한 요청으로 제한하고 같은 조건의 캐시를 공유한다', async () => {
        login(); const view = setup(committed('강남 공방'));
        await waitFor(() => expect(searchService.public).toHaveBeenCalledOnce());
        expect(searchService.public.mock.calls[0][2]).toMatchObject({ scope: 'stores', region: '서울 강남구', term: '공방' });
        expect(searchService.personal).not.toHaveBeenCalled();
        view.rerender({ keyword: '', confirmed: false }); view.rerender(committed('강남 공방'));
        await act(async () => { await Promise.resolve(); });
        expect(searchService.public).toHaveBeenCalledOnce();
    });
    it('개인 날짜 필터도 인증 대기나 로그아웃 상태에서 요청하지 않는다', async () => {
        const view = setup({ ...committed('내 예약 내일'), submittedAt: Date.parse('2026-10-25T15:01:00Z') });
        await act(async () => { await Promise.resolve(); });
        expect(view.result.current.authRequired).toBe(true);
        expect(searchService.public).not.toHaveBeenCalled(); expect(searchService.personal).not.toHaveBeenCalled();
    });
});
