import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import useStoreList from '../useStoreList';
import useStoreImageHint from '../useStoreImageHint';
import { storeKeys } from '../queryKeys';
import storeService from '../../services/storeService';

vi.mock('../../services/storeService', () => ({ default: { getStores: vi.fn() } }));

const serverPage = (number = 0, total = 25) => ({
    content: Array.from({ length: Math.max(0, Math.min(12, total - number * 12)) }, (_, i) => ({
        id: number * 12 + i + 1, name: `가게 ${number * 12 + i + 1}`,
    })),
    page: { number, size: 12, totalElements: total, totalPages: Math.ceil(total / 12) },
});

const RouteProbe = () => {
    const location = useLocation();
    const navigate = useNavigate();
    return <>
        <output data-testid="route">{location.pathname}{location.search}</output>
        <button type="button" onClick={() => navigate(-1)}>이전 목록</button>
        <button type="button" onClick={() => navigate('/stores?page=2')}>2페이지 URL</button>
        <button type="button" onClick={() => navigate('/stores?page=3')}>3페이지 URL</button>
    </>;
};

const renderList = (url = '/stores', client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
})) => {
    const wrapper = ({ children }) => <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
            <RouteProbe />
            {children}
        </MemoryRouter>
    </QueryClientProvider>;
    return { ...renderHook(() => useStoreList(), { wrapper }), client, wrapper };
};

const routeParams = () => new URLSearchParams(screen.getByTestId('route').textContent.split('?')[1]);

describe('공개 가게 서버 페이지네이션', () => {
    beforeEach(() => {
        storeService.getStores.mockReset();
        storeService.getStores.mockImplementation(async ({ page }) => serverPage(page));
    });

    it('1-based URL을 0-based API·12건으로 전달하고 누적하지 않는다', async () => {
        const { result } = renderList('/stores?keyword=카페&domain=DINING&page=2');
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(storeService.getStores).toHaveBeenLastCalledWith({
            keyword: '카페', domain: 'DINING', sort: 'recommended', page: 1, size: 12,
        });
        expect(result.current.page).toBe(2);
        expect(result.current.totalElements).toBe(25);
        expect(result.current.stores.map(store => store.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 13));

        act(() => result.current.setPage(3));
        await waitFor(() => expect(result.current.stores[0]?.id).toBe(25));
        expect(result.current.stores).toHaveLength(1);
        expect(routeParams().get('page')).toBe('3');
    });

    it('기존 평탄 Page 메타를 읽는다', async () => {
        const legacy = serverPage(1, 37);
        storeService.getStores.mockResolvedValue({ content: legacy.content, ...legacy.page });
        const { result } = renderList('/stores?page=2');
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.totalElements).toBe(37);
        expect(result.current.totalPages).toBe(4);
    });

    it.each([
        { keyword: '새 검색' }, { domain: 'BEAUTY' }, { region: '서울 종로구' }, { sort: 'reviews' },
        { lat: '37.8' }, { lng: '127.8' },
    ])('필터 변경 %j과 page reset을 한 URL 갱신으로 반영한다', async patch => {
        storeService.getStores.mockImplementation(async ({ page }) => serverPage(page, 60));
        const { result } = renderList('/stores?page=3&keyword=기존&domain=DINING&sort=distance&lat=37&lng=127&keep=yes');
        await waitFor(() => expect(result.current.stores[0]?.id).toBe(25));
        act(() => result.current.setSearchParams(patch));
        await waitFor(() => expect(result.current.stores[0]?.id).toBe(1));
        expect(result.current.page).toBe(1);
        expect(routeParams().has('page')).toBe(false);
        expect(routeParams().get('keep')).toBe('yes');
        for (const [key, value] of Object.entries(patch)) expect(routeParams().get(key)).toBe(value);
        expect(storeService.getStores.mock.calls.at(-1)[0].page).toBe(0);
    });

    it('같은 필터를 다시 지정하면 현재 페이지를 유지한다', async () => {
        const { result } = renderList('/stores?page=2&domain=DINING');
        await waitFor(() => expect(result.current.stores[0]?.id).toBe(13));
        act(() => result.current.setSearchParams({ domain: 'DINING' }));
        expect(routeParams().get('page')).toBe('2');
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
    });

    it.each(['0', '-2', '1.5', 'NaN', '01', '99999999999999999999'])('잘못된 page=%s를 첫 페이지로 정규화한다', async value => {
        const { result } = renderList(`/stores?page=${value}&keyword=보존`);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.page).toBe(1);
        expect(routeParams().has('page')).toBe(false);
        expect(routeParams().get('keyword')).toBe('보존');
        expect(storeService.getStores.mock.calls[0][0].page).toBe(0);
    });

    it('범위를 벗어난 공유 URL은 마지막 유효 페이지로 replace한다', async () => {
        const { result } = renderList('/stores?page=999&keyword=보존');
        await waitFor(() => expect(result.current.stores[0]?.id).toBe(25));
        expect(storeService.getStores.mock.calls.map(([params]) => params.page)).toEqual([998, 2]);
        expect(result.current.page).toBe(3);
        expect(routeParams().get('keyword')).toBe('보존');
    });

    it('0건은 page 1로 복구하며 오류와 구분한다', async () => {
        storeService.getStores.mockResolvedValue(serverPage(0, 0));
        const { result } = renderList('/stores?page=9');
        await waitFor(() => expect(result.current.loading).toBe(false));
        await waitFor(() => expect(result.current.page).toBe(1));
        expect(result.current.totalElements).toBe(0);
        expect(result.current.stores).toEqual([]);
        expect(result.current.error).toBeNull();
    });

    it('조회 실패로 페이지를 잘못 보정하지 않고 다시 조회할 수 있다', async () => {
        storeService.getStores.mockRejectedValueOnce(new Error('목록을 불러오지 못했어요.'));
        const { result } = renderList('/stores?page=2');
        await waitFor(() => expect(result.current.error).toBe('목록을 불러오지 못했어요.'));
        expect(result.current.page).toBe(2);
        storeService.getStores.mockResolvedValue(serverPage(1));
        await act(async () => { await result.current.refetch(); });
        await waitFor(() => expect(result.current.error).toBeNull());
        expect(result.current.stores[0]?.id).toBe(13);
    });

    it('뒤로가기에서는 URL과 페이지별 캐시를 복원한다', async () => {
        const { result } = renderList('/stores?domain=DINING');
        await waitFor(() => expect(result.current.stores[0]?.id).toBe(1));
        act(() => result.current.setPage(2));
        await waitFor(() => expect(result.current.stores[0]?.id).toBe(13));
        act(() => screen.getByRole('button', { name: '이전 목록' }).click());
        await waitFor(() => expect(result.current.page).toBe(1));
        expect(result.current.stores[0]?.id).toBe(1);
        expect(result.current.loading).toBe(false);
        expect(routeParams().get('domain')).toBe('DINING');
        expect(storeService.getStores).toHaveBeenCalledTimes(2);
    });

    it('늦게 도착한 이전 URL 응답이 현재 페이지를 덮지 않는다', async () => {
        let resolveLate;
        storeService.getStores.mockImplementation(({ page }) => page === 0
            ? new Promise(resolve => { resolveLate = resolve; })
            : Promise.resolve(serverPage(page)));
        const { result } = renderList();
        act(() => screen.getByRole('button', { name: '2페이지 URL' }).click());
        await waitFor(() => expect(result.current.stores[0]?.id).toBe(13));
        await act(async () => { resolveLate(serverPage(0)); });
        expect(result.current.page).toBe(2);
        expect(result.current.stores[0]?.id).toBe(13);
    });

    it('placeholder의 작은 전체 페이지 수로 새 URL을 잘못 보정하지 않는다', async () => {
        let resolveNew;
        storeService.getStores.mockImplementation(({ page }) => page === 0
            ? Promise.resolve(serverPage(0, 2))
            : new Promise(resolve => { resolveNew = resolve; }));
        const { result } = renderList();
        await waitFor(() => expect(result.current.stores).toHaveLength(2));
        act(() => screen.getByRole('button', { name: '3페이지 URL' }).click());
        await waitFor(() => expect(result.current.refetching).toBe(true));
        expect(routeParams().get('page')).toBe('3');
        await act(async () => { resolveNew(serverPage(2, 25)); });
        expect(result.current.page).toBe(3);
        await waitFor(() => expect(result.current.stores[0]?.id).toBe(25));
    });

    it('단일 Page 캐시에서도 상세 커버 원본 비율 힌트를 찾는다', () => {
        const client = new QueryClient();
        client.setQueryData(storeKeys.list({ page: 0, size: 12 }), {
            content: [{ id: 90123, mainImageWidth: 960, mainImageHeight: 640 }],
        });
        const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
        const { result } = renderHook(() => useStoreImageHint(90123), { wrapper });
        expect(result.current).toEqual({ width: 960, height: 640 });
    });
});
