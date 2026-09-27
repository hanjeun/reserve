import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Benefits from './Benefits';
import benefitService from '../../services/benefitService';
import storeService from '../../services/storeService';
import { benefitKeys } from '../../hooks/queryKeys';

vi.mock('../../services/benefitService', () => ({ default: { getList: vi.fn() } }));
vi.mock('../../services/storeService', () => ({ default: { getStores: vi.fn() } }));
vi.mock('../../components/common', async () => ({
    Bone: (await import('../../components/common/Bone')).default,
    Button: (await import('../../components/common/Button')).default,
    DataState: (await import('../../components/common/DataState')).default,
}));

const NEWS_TOTAL = 37;
const newsPage = (number = 0, total = NEWS_TOTAL) => ({
    content: [{ id: number * 12 + 1, storeId: 12, storeName: '소식 가게', title: `소식 페이지 ${number + 1}`, excerpt: '가게가 직접 작성한 안내', createdAt: '2026-09-14T10:00:00' }],
    page: { number, size: 12, totalElements: total, totalPages: Math.ceil(total / 12) },
});
const deferred = () => {
    let resolve;
    const promise = new Promise(success => { resolve = success; });
    return { promise, resolve };
};
const clients = [];

function RouteProbe({ onLocation }) {
    const location = useLocation();
    useEffect(() => { onLocation(location.search); }, [location.search, onLocation]);
    return <output data-testid="shared-search">{location.search}</output>;
}

function renderPage(url) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60000 } } });
    const onLocation = vi.fn();
    clients.push(client);
    const result = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>
        <RouteProbe onLocation={onLocation} /><Routes><Route path="/benefits" element={<Benefits />} /></Routes>
    </MemoryRouter></QueryClientProvider>);
    return { ...result, client, onLocation };
}

const params = () => Object.fromEntries(new URLSearchParams(screen.getByTestId('shared-search').textContent));
const paginate = page => {
    const target = screen.getByRole('navigation', { name: '가게 소식 페이지' }).querySelector(`.ant-pagination-item-${page} a`);
    expect(target).not.toBeNull();
    fireEvent.click(target);
};
const newsLink = page => screen.findByRole('link', { name: `소식 가게 · 소식 페이지 ${page} 소식 보기` });

describe('benefits-only query integration; general store pagination remains on /stores', () => {
    beforeEach(() => {
        benefitService.getList.mockReset();
        storeService.getStores.mockReset();
        benefitService.getList.mockImplementation(async ({ page }) => newsPage(page));
        window.scrollTo = vi.fn();
    });
    afterEach(() => { clients.splice(0).forEach(client => client.clear()); });

    it('repairs only an invalid news page without consuming or changing unrelated store URL state', async () => {
        const news = deferred();
        benefitService.getList.mockReturnValueOnce(news.promise);
        const { client, onLocation } = renderPage('/benefits?page=-1&domain=bad&sort=bad&storePage=bad&keep=1');
        await waitFor(() => expect(benefitService.getList).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('status', { name: '가게 소식을 불러오는 중' })).toBeInTheDocument();
        await act(async () => { news.resolve(newsPage(0)); await news.promise; });
        await newsLink(1);
        await waitFor(() => expect(params()).toEqual({ domain: 'bad', sort: 'bad', storePage: 'bad', keep: '1' }));
        expect(benefitService.getList).toHaveBeenCalledWith({ page: 0, size: 12 }, expect.any(AbortSignal));
        expect(client.getQueryData(benefitKeys.list({ page: 0, size: 12 })).page.number).toBe(0);
        expect(client.getQueryCache().findAll({ queryKey: ['stores'] })).toHaveLength(0);
        expect(storeService.getStores).not.toHaveBeenCalled();
        expect(screen.queryByRole('region', { name: '일반 가게 탐색' })).not.toBeInTheDocument();
        const locationCount = onLocation.mock.calls.length;
        await act(async () => { await Promise.resolve(); });
        expect(onLocation).toHaveBeenCalledTimes(locationCount);
        expect(locationCount).toBeLessThanOrEqual(2);
        expect(benefitService.getList).toHaveBeenCalledTimes(1);
    });

    it('paginates 12-item news with nested totals and reuses fresh page cache while preserving all other params', async () => {
        const { client } = renderPage('/benefits?page=2&storePage=3&domain=FOOD&sort=reviews&keep=1');
        await newsLink(2);
        expect(params()).toEqual({ page: '2', storePage: '3', domain: 'FOOD', sort: 'reviews', keep: '1' });
        expect(benefitService.getList).toHaveBeenCalledWith({ page: 1, size: 12 }, expect.any(AbortSignal));
        expect(client.getQueryData(benefitKeys.list({ page: 1, size: 12 })).page.totalElements).toBe(NEWS_TOTAL);
        expect(screen.queryByText(/개 소식|총 .*개 가게/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '서비스 분야 선택' })).not.toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: '함께 둘러볼 가게 페이지' })).not.toBeInTheDocument();

        paginate(3);
        await newsLink(3);
        expect(params()).toEqual({ page: '3', storePage: '3', domain: 'FOOD', sort: 'reviews', keep: '1' });
        expect(benefitService.getList).toHaveBeenCalledTimes(2);
        paginate(2);
        await newsLink(2);
        expect(benefitService.getList).toHaveBeenCalledTimes(2);
        paginate(1);
        await newsLink(1);
        expect(params()).toEqual({ storePage: '3', domain: 'FOOD', sort: 'reviews', keep: '1' });
        expect(benefitService.getList).toHaveBeenLastCalledWith({ page: 0, size: 12 }, expect.any(AbortSignal));
        expect(storeService.getStores).not.toHaveBeenCalled();
    });

    it('does not query general stores even when their mocked endpoint would fail', async () => {
        storeService.getStores.mockRejectedValue(new Error('stores offline'));
        renderPage('/benefits?domain=SPORTS&sort=bad&storePage=999&keep=1');
        await newsLink(1);
        expect(params()).toEqual({ domain: 'SPORTS', sort: 'bad', storePage: '999', keep: '1' });
        expect(storeService.getStores).not.toHaveBeenCalled();
        expect(screen.queryByText('가게 목록을 불러오지 못했어요.')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: '소식 가게' })).toBeInTheDocument();
    });

    it('keeps a valid page through failure and explicitly retries the same news request without manufacturing zero', async () => {
        benefitService.getList.mockRejectedValueOnce(new Error('news offline')).mockResolvedValueOnce(newsPage(1));
        renderPage('/benefits?page=2&storePage=3&domain=FOOD&sort=reviews&keep=1');
        await screen.findByText('가게 소식을 불러오지 못했어요.');
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('아직 등록된 가게 소식이 없어요.')).not.toBeInTheDocument();
        expect(params()).toEqual({ page: '2', storePage: '3', domain: 'FOOD', sort: 'reviews', keep: '1' });
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        await newsLink(2);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(benefitService.getList).toHaveBeenCalledTimes(2);
        expect(benefitService.getList).toHaveBeenLastCalledWith({ page: 1, size: 12 }, expect.any(AbortSignal));
        expect(params().page).toBe('2');
        expect(storeService.getStores).not.toHaveBeenCalled();
    });

    it('keeps real banners visible during background refetch and updates only the news cache after completion', async () => {
        const { client } = renderPage('/benefits?page=2&keep=1');
        await newsLink(2);
        const next = deferred();
        benefitService.getList.mockReturnValueOnce(next.promise);
        let refresh;
        await act(async () => { refresh = client.invalidateQueries({ queryKey: benefitKeys.list({ page: 1, size: 12 }) }); });
        expect(await screen.findByText('소식을 새로 불러오는 중')).toHaveAttribute('role', 'status');
        expect(document.querySelector('.reserve-benefit-list')).toHaveAttribute('aria-busy', 'true');
        expect(await newsLink(2)).toBeInTheDocument();
        expect(screen.queryByText('아직 등록된 가게 소식이 없어요.')).not.toBeInTheDocument();
        const updated = newsPage(1);
        updated.content[0].title = '새로 받은 소식';
        await act(async () => { next.resolve(updated); await refresh; });
        expect(await screen.findByRole('link', { name: '소식 가게 · 새로 받은 소식 소식 보기' })).toBeInTheDocument();
        expect(document.querySelector('.reserve-benefit-list')).toHaveAttribute('aria-busy', 'false');
        expect(screen.queryByText('소식을 새로 불러오는 중')).not.toBeInTheDocument();
        expect(client.getQueryData(benefitKeys.list({ page: 1, size: 12 })).content[0].title).toBe('새로 받은 소식');
        expect(params()).toEqual({ page: '2', keep: '1' });
        expect(storeService.getStores).not.toHaveBeenCalled();
    });

    it('passes an abortable signal and cancels the pending news request when its page unmounts', async () => {
        benefitService.getList.mockReturnValue(new Promise(() => {}));
        const { unmount } = renderPage('/benefits?page=2&keep=1');
        await waitFor(() => expect(benefitService.getList).toHaveBeenCalledTimes(1));
        const signal = benefitService.getList.mock.calls[0][1];
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
        unmount();
        expect(signal.aborted).toBe(true);
        expect(storeService.getStores).not.toHaveBeenCalled();
    });

    it('corrects a safe upper-bound page using legacy total metadata without modifying store params', async () => {
        benefitService.getList.mockResolvedValueOnce({ content: [], totalElements: 13 })
            .mockResolvedValueOnce({ content: newsPage(1).content, totalElements: 13 });
        renderPage('/benefits?page=10000&domain=CAFE&sort=rating&storePage=4&keep=1');
        await newsLink(2);
        expect(benefitService.getList).toHaveBeenNthCalledWith(1, { page: 9999, size: 12 }, expect.any(AbortSignal));
        expect(benefitService.getList).toHaveBeenNthCalledWith(2, { page: 1, size: 12 }, expect.any(AbortSignal));
        expect(params()).toEqual({ page: '2', domain: 'CAFE', sort: 'rating', storePage: '4', keep: '1' });
        expect(screen.queryByText('아직 등록된 가게 소식이 없어요.')).not.toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: '가게 소식 페이지' })).toBeInTheDocument();
        expect(storeService.getStores).not.toHaveBeenCalled();
    });

    it('normalizes a successful real zero to the first news page and exposes only the existing /stores link', async () => {
        benefitService.getList.mockResolvedValue({ content: [], page: { totalElements: 0 } });
        renderPage('/benefits?page=3&domain=FOOD&storePage=4&keep=1');
        await screen.findByText('아직 등록된 가게 소식이 없어요.');
        await waitFor(() => expect(params()).toEqual({ domain: 'FOOD', storePage: '4', keep: '1' }));
        expect(benefitService.getList).toHaveBeenNthCalledWith(1, { page: 2, size: 12 }, expect.any(AbortSignal));
        expect(benefitService.getList).toHaveBeenNthCalledWith(2, { page: 0, size: 12 }, expect.any(AbortSignal));
        expect(await screen.findByRole('link', { name: '가게 둘러보기' })).toHaveAttribute('href', '/stores');
        expect(document.querySelector('.reserve-benefits-empty img')).toBeNull();
        expect(screen.queryByRole('navigation', { name: '가게 소식 페이지' })).not.toBeInTheDocument();
        expect(storeService.getStores).not.toHaveBeenCalled();
    });
});
