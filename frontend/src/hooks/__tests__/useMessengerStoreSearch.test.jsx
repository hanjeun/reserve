import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useMessengerStoreSearch from '../useMessengerStoreSearch';
import useMessengerStore from '../../store/useMessengerStore';
import storeService from '../../services/storeService';

vi.mock('../../services/storeService', () => ({ default: { getStores: vi.fn() } }));
const page = content => ({ content, page: { totalElements: content.length, totalPages: 1 } });
const clients = [];
const views = [];
const initialState = useMessengerStore.getState();
const advance = milliseconds => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
const renderSearch = props => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    clients.push(client);
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const view = renderHook(options => useMessengerStoreSearch(options), { wrapper, initialProps: props });
    views.push(view);
    return view;
};

describe('messenger public store search', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        useMessengerStore.setState({ sessionIdentity: '7:USER:1', storeSearch: null });
        storeService.getStores.mockReset().mockResolvedValue(page([]));
    });
    afterEach(() => {
        views.splice(0).forEach(view => view.unmount());
        clients.splice(0).forEach(client => client.clear());
        useMessengerStore.setState(initialState);
        vi.useRealTimers();
    });

    it('waits 300 ms after Hangul composition and never searches an empty keyword', async () => {
        const view = renderSearch({ keyword: '', page: 0 });
        await advance(300);
        expect(storeService.getStores).not.toHaveBeenCalled();
        view.rerender({ keyword: '카', page: 0, composing: true });
        await advance(300);
        view.rerender({ keyword: '카페', page: 0, composing: true });
        await advance(300);
        expect(storeService.getStores).not.toHaveBeenCalled();
        view.rerender({ keyword: '카페', page: 0, composing: false });
        await advance(299);
        expect(storeService.getStores).not.toHaveBeenCalled();
        await advance(1);
        expect(storeService.getStores).toHaveBeenCalledExactlyOnceWith(
            { keyword: '카페', sort: 'rating', page: 0, size: 20 }, expect.any(AbortSignal));
    });

    it('aborts replaced queries and prevents a late response from replacing a new keyword or page', async () => {
        let finishFirst;
        let finishSecond;
        storeService.getStores.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
        const view = renderSearch({ keyword: '카페', page: 0 });
        const firstSignal = storeService.getStores.mock.calls[0][1];
        view.rerender({ keyword: '공방', page: 0 });
        expect(firstSignal.aborted).toBe(true);
        await advance(300);
        await act(async () => finishSecond(page([{ id: 42, name: '새 공방' }])));
        await advance(1);
        expect(view.result.current.stores).toEqual([{ id: 42, name: '새 공방' }]);
        await act(async () => finishFirst(page([{ id: 31, name: '이전 카페' }])));
        await advance(1);
        expect(view.result.current.stores).toEqual([{ id: 42, name: '새 공방' }]);
        view.rerender({ keyword: '공방', page: 1 });
        expect(storeService.getStores).toHaveBeenLastCalledWith(
            { keyword: '공방', sort: 'rating', page: 1, size: 20 }, expect.any(AbortSignal));
    });

    it('does not expose the previous session response after its query is cancelled', async () => {
        let finishOld;
        storeService.getStores.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
            .mockReturnValueOnce(new Promise(() => {}));
        const view = renderSearch({ keyword: '공방', page: 0 });
        const signal = storeService.getStores.mock.calls[0][1];
        act(() => useMessengerStore.setState({ sessionIdentity: '8:USER:2' }));
        expect(signal.aborted).toBe(true);
        await act(async () => finishOld(page([{ id: 31, name: '이전 세션 결과' }])));
        await advance(1);
        expect(view.result.current.hasData).toBe(false);
        expect(view.result.current.stores).toEqual([]);
    });

    it('keeps a forbidden response as an error instead of a successful empty result', async () => {
        vi.useRealTimers();
        storeService.getStores.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
        const view = renderSearch({ keyword: '공방', page: 0 });
        await waitFor(() => expect(view.result.current.query.isError).toBe(true));
        expect(view.result.current.hasData).toBe(false);
        expect(storeService.getStores).toHaveBeenCalledOnce();
    });
});
