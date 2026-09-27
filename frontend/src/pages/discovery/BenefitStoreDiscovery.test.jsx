import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import BenefitStoreDiscovery from './BenefitStoreDiscovery';
import storeService from '../../services/storeService';
import adService from '../../services/adService';
import { storeKeys } from '../../hooks/queryKeys';

vi.mock('../../services/storeService', () => ({ default: { getStores: vi.fn() } }));
vi.mock('../../services/adService', () => ({ default: { recordImpression: vi.fn() } }));
// Keep the real card/cover/badge while isolating unrelated favorite reads and writes.
vi.mock('../../components/common', async () => ({
    Card: (await import('../../components/common/Card')).default,
    Badge: (await import('../../components/common/Badge')).default,
    FavoriteButton: () => null,
}));

const store = (id = 1) => ({ id, name: `가게 ${id}`, category: '카페', rating: 4.5, reviewCount: 7, mainImageUrl: '/uploads/cover.png', mainImageWidth: 960, mainImageHeight: 640 });
const serverPage = (number = 0, total = 25) => ({
    content: total > number * 12 ? [store(number * 12 + 1)] : [],
    page: { number, size: 12, totalElements: total, totalPages: Math.ceil(total / 12) },
});
const deferred = () => {
    let resolve;
    const promise = new Promise(success => { resolve = success; });
    return { promise, resolve };
};
const RouteProbe = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const move = page => {
        const next = new URLSearchParams(location.search);
        next.set('storePage', String(page));
        navigate({ pathname: '/benefits', search: `?${next}` });
    };
    return <>
        <output data-testid="route">{location.pathname}{location.search}</output>
        <button type="button" onClick={() => navigate(-1)}>이전 화면</button>
        <button type="button" onClick={() => move(2)}>가게 2페이지 URL</button>
        <button type="button" onClick={() => move(3)}>가게 3페이지 URL</button>
    </>;
};
const renderPage = (url = '/benefits', client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => ({
    ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/previous?keep=origin', url]} initialIndex={1}>
        <RouteProbe /><Routes><Route path="/benefits" element={<BenefitStoreDiscovery />} /><Route path="/previous" element={<p>이전 페이지</p>} /></Routes>
    </MemoryRouter></QueryClientProvider>),
    client,
});
const routeParams = () => new URLSearchParams(screen.getByTestId('route').textContent.split('?')[1]);
const select = async (label, option) => {
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: option }));
};
const settle = request => act(async () => { request.resolve(serverPage(0)); await request.promise; });

describe('benefit page general store discovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storeService.getStores.mockReset();
        storeService.getStores.mockImplementation(async ({ page }) => serverPage(page));
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('uses the real store card and nested server total without implying benefits or adding ads', async () => {
        renderPage('/benefits?page=4&domain=FOOD&sort=reviews&storePage=2&keep=yes&lat=37&lng=127');
        const link = await screen.findByRole('link', { name: '가게 13 상세 보기' });
        expect(link).toHaveAttribute('href', '/store/13');
        expect(screen.getByRole('img', { name: '가게 13' })).toHaveAttribute('width', '960');
        expect(screen.getByRole('img', { name: '가게 13' })).toHaveAttribute('height', '640');
        expect(screen.getByText('총 25개 가게')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '가게도 함께 둘러보세요' })).toBeInTheDocument();
        expect(screen.getByText('아래는 서비스별 전체 가게예요. 혜택 제공 여부는 각 가게의 소식에서 확인해 주세요.')).toBeInTheDocument();
        expect(storeService.getStores).toHaveBeenCalledWith({ domain: 'FOOD', sort: 'reviews', page: 1, size: 12 });
        expect(document.querySelector('#benefit-stores')).toHaveClass('reserve-benefit-store-discovery');
        expect(screen.getByRole('button', { name: '서비스 분야 선택' })).toHaveClass('reserve-filter-menu--plain');
        expect(adService.recordImpression).not.toHaveBeenCalled();
        expect(screen.queryByText('혜택 적용 가게')).toBeNull();
        expect(screen.queryByText('광고')).toBeNull();
    });

    it('reads flat totals and paginates only the storePage while retaining news and filters', async () => {
        storeService.getStores.mockImplementation(async ({ page }) => ({ content: [store(page * 12 + 1)], totalElements: 37, totalPages: 4 }));
        renderPage('/benefits?page=5&domain=FOOD&sort=recent&keep=yes');
        expect(await screen.findByText('총 37개 가게')).toBeInTheDocument();
        const pagination = screen.getByRole('navigation', { name: '함께 둘러볼 가게 페이지' });
        fireEvent.click(pagination.querySelector('.ant-pagination-item-2 a'));
        expect(await screen.findByRole('link', { name: '가게 13 상세 보기' })).toBeInTheDocument();
        expect(routeParams().get('storePage')).toBe('2');
        expect(routeParams().get('page')).toBe('5');
        expect(routeParams().get('domain')).toBe('FOOD');
        expect(routeParams().get('sort')).toBe('recent');
        expect(routeParams().get('keep')).toBe('yes');
        expect(storeService.getStores).toHaveBeenLastCalledWith({ domain: 'FOOD', sort: 'recent', page: 1, size: 12 });
        expect(screen.queryByRole('link', { name: '가게 1 상세 보기' })).toBeNull();
    });

    it('uses actual service enums and resets only the store page on a domain change', async () => {
        renderPage('/benefits?page=5&storePage=3&sort=reviews&keep=yes');
        await screen.findByRole('link', { name: '가게 25 상세 보기' });
        await select('서비스 분야 선택', '뷰티 · 클리닉');
        await screen.findByRole('link', { name: '가게 1 상세 보기' });
        expect(storeService.getStores).toHaveBeenLastCalledWith({ domain: 'BEAUTY_CLINIC', sort: 'reviews', page: 0, size: 12 });
        expect(routeParams().has('storePage')).toBe(false);
        expect(routeParams().get('page')).toBe('5');
        expect(routeParams().get('sort')).toBe('reviews');
        expect(routeParams().get('keep')).toBe('yes');
        await select('서비스 분야 선택', '전체 분야');
        await waitFor(() => expect(routeParams().has('domain')).toBe(false));
    });

    it.each([['리뷰순', 'reviews'], ['최신순', 'recent']])('sends the server-supported %s sort and preserves the news page', async (label, sort) => {
        renderPage('/benefits?page=5&domain=SPORTS&storePage=2&keep=yes');
        await screen.findByRole('link', { name: '가게 13 상세 보기' });
        fireEvent.click(screen.getByRole('button', { name: '가게 정렬 선택' }));
        expect(await screen.findByRole('menuitemradio', { name: '별점순' })).toHaveAttribute('aria-checked', 'true');
        expect(screen.queryByRole('menuitemradio', { name: '거리순' })).toBeNull();
        expect(screen.queryByRole('menuitemradio', { name: '이름순' })).toBeNull();
        fireEvent.click(screen.getByRole('menuitemradio', { name: label }));
        await screen.findByRole('link', { name: '가게 1 상세 보기' });
        expect(storeService.getStores).toHaveBeenLastCalledWith({ domain: 'SPORTS', sort, page: 0, size: 12 });
        expect(routeParams().has('storePage')).toBe(false);
        expect(routeParams().get('page')).toBe('5');
        expect(routeParams().get('keep')).toBe('yes');
    });

    it('shows the existing twelve-card skeleton for initial loading and locks the filters', async () => {
        const request = deferred();
        storeService.getStores.mockReturnValueOnce(request.promise);
        renderPage();
        const grid = screen.getByRole('status', { name: '가게 목록을 불러오는 중' });
        expect(grid).toHaveClass('reserve-benefit-store-grid');
        expect(grid.children).toHaveLength(12);
        expect(screen.getByRole('button', { name: '서비스 분야 선택' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '가게 정렬 선택' })).toBeDisabled();
        expect(screen.queryByText('총 0개 가게')).toBeNull();
        await settle(request);
        await screen.findByRole('link', { name: '가게 1 상세 보기' });
    });

    it('shows skeletons during a same-key background fetch rather than leaving old cards actionable', async () => {
        const { client } = renderPage();
        await screen.findByRole('link', { name: '가게 1 상세 보기' });
        const request = deferred();
        storeService.getStores.mockReturnValueOnce(request.promise);
        act(() => { void client.invalidateQueries({ queryKey: storeKeys.list({ sort: 'rating', page: 0, size: 12 }) }); });
        await screen.findByRole('status', { name: '가게 목록을 불러오는 중' });
        expect(screen.queryByRole('link', { name: '가게 1 상세 보기' })).toBeNull();
        expect(screen.getByRole('button', { name: '가게 정렬 선택' })).toBeDisabled();
        await settle(request);
        await screen.findByRole('link', { name: '가게 1 상세 보기' });
    });

    it('distinguishes successful zero results from errors and returns a zero-result shared URL to page one', async () => {
        storeService.getStores.mockResolvedValue(serverPage(0, 0));
        renderPage('/benefits?page=4&storePage=9&domain=POPUP');
        expect(await screen.findByText('선택한 서비스 분야에 등록된 가게가 없어요.')).toBeInTheDocument();
        expect(screen.getByText('총 0개 가게')).toBeInTheDocument();
        expect(screen.queryByText('가게 목록을 불러오지 못했어요.')).toBeNull();
        expect(screen.queryByRole('navigation', { name: '함께 둘러볼 가게 페이지' })).toBeNull();
        expect(routeParams().has('storePage')).toBe(false);
        expect(routeParams().get('page')).toBe('4');
        expect(routeParams().get('domain')).toBe('POPUP');
    });

    it('does not repair a failed shared URL, and repairs it only after successful retry', async () => {
        storeService.getStores.mockRejectedValueOnce(new Error('offline'));
        renderPage('/benefits?page=4&storePage=01&keep=yes');
        expect(await screen.findByText('가게 목록을 불러오지 못했어요.')).toBeInTheDocument();
        expect(routeParams().get('storePage')).toBe('01');
        expect(screen.queryByText('총 0개 가게')).toBeNull();
        expect(screen.queryByText('선택한 서비스 분야에 등록된 가게가 없어요.')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        await screen.findByRole('link', { name: '가게 1 상세 보기' });
        await waitFor(() => expect(routeParams().has('storePage')).toBe(false));
        expect(routeParams().get('page')).toBe('4');
        expect(routeParams().get('keep')).toBe('yes');
    });

    it.each(['0', '-1', '1.5', '01', 'NaN', '99999999999999999999', '178956972'])('safely queries and replaces invalid storePage=%s only after success', async value => {
        renderPage(`/benefits?page=4&storePage=${value}&keep=yes`);
        await screen.findByRole('link', { name: '가게 1 상세 보기' });
        await waitFor(() => expect(routeParams().has('storePage')).toBe(false));
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
        expect(storeService.getStores).toHaveBeenCalledWith({ sort: 'rating', page: 0, size: 12 });
        expect(routeParams().get('page')).toBe('4');
        expect(routeParams().get('keep')).toBe('yes');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면' }));
        expect(await screen.findByText('이전 페이지')).toBeInTheDocument();
    });

    it('replaces an out-of-range store page using its own successful totals and retains other parameters', async () => {
        renderPage('/benefits?page=4&storePage=999&domain=FOOD&keep=yes');
        await screen.findByRole('link', { name: '가게 25 상세 보기' });
        expect(storeService.getStores.mock.calls.map(([params]) => params.page)).toEqual([998, 2]);
        expect(routeParams().get('storePage')).toBe('3');
        expect(routeParams().get('page')).toBe('4');
        expect(routeParams().get('domain')).toBe('FOOD');
        expect(routeParams().get('keep')).toBe('yes');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면' }));
        expect(await screen.findByText('이전 페이지')).toBeInTheDocument();
    });

    it('normalizes unknown domain and location-dependent sort without forwarding coordinates or inventing filters', async () => {
        renderPage('/benefits?page=4&domain=UNKNOWN&sort=distance&lat=37&lng=127&keep=yes');
        await screen.findByRole('link', { name: '가게 1 상세 보기' });
        await waitFor(() => expect(routeParams().has('domain')).toBe(false));
        expect(routeParams().has('sort')).toBe(false);
        expect(routeParams().get('page')).toBe('4');
        expect(routeParams().get('lat')).toBe('37');
        expect(routeParams().get('lng')).toBe('127');
        expect(storeService.getStores).toHaveBeenCalledWith({ sort: 'rating', page: 0, size: 12 });
    });

    it('isolates a late previous-page response and its cache from the current store page', async () => {
        const request = deferred();
        storeService.getStores.mockImplementation(({ page }) => page === 0 ? request.promise : Promise.resolve(serverPage(page)));
        const { client } = renderPage('/benefits?page=4&domain=FOOD');
        fireEvent.click(screen.getByRole('button', { name: '가게 2페이지 URL' }));
        await screen.findByRole('link', { name: '가게 13 상세 보기' });
        await act(async () => { request.resolve(serverPage(0, 1)); await request.promise; });
        expect(screen.getByRole('link', { name: '가게 13 상세 보기' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: '가게 1 상세 보기' })).toBeNull();
        expect(routeParams().get('storePage')).toBe('2');
        expect(client.getQueryData(storeKeys.list({ domain: 'FOOD', sort: 'rating', page: 0, size: 12 })).page.totalElements).toBe(1);
        expect(client.getQueryData(storeKeys.list({ domain: 'FOOD', sort: 'rating', page: 1, size: 12 })).page.totalElements).toBe(25);
    });

    it('does not clamp a new page with the previous placeholder result count', async () => {
        const request = deferred();
        storeService.getStores.mockImplementation(({ page }) => page === 0 ? Promise.resolve(serverPage(0, 2)) : request.promise);
        renderPage('/benefits?page=4');
        await screen.findByText('총 2개 가게');
        fireEvent.click(screen.getByRole('button', { name: '가게 3페이지 URL' }));
        await screen.findByRole('status', { name: '가게 목록을 불러오는 중' });
        expect(routeParams().get('storePage')).toBe('3');
        await act(async () => { request.resolve(serverPage(2, 25)); await request.promise; });
        await screen.findByRole('link', { name: '가게 25 상세 보기' });
        expect(routeParams().get('storePage')).toBe('3');
        expect(routeParams().get('page')).toBe('4');
    });
});
