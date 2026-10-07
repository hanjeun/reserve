import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import api from '../../api/axios';
import benefitService from '../../services/benefitService';
import Benefits, { BenefitRow, BENEFIT_PAGE_SIZE } from './Benefits';
import BenefitDetail from './BenefitDetail';
import { BENEFIT_IMAGE_FALLBACK } from './benefitPresentation';

vi.mock('../../api/axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../services/benefitService', () => ({ default: { getList: vi.fn(), getDetail: vi.fn() } }));

const BENEFITS_TITLE = '혜택';
const item = {
    id: 7,
    storeId: 12,
    storeName: '소식을 전한 가게',
    title: '가게의 새 메뉴 소식',
    excerpt: '가게가 직접 작성한 안내예요.',
    content: '<script>window.hacked = true</script>\n<img src=x onerror="window.hacked=true">\n원문 안내',
    mainImageUrl: 'https://cdn.reserve.it.kr/users/1/stores/12/thumbnails/menu.png',
    createdAt: '2026-09-13T10:00:00',
};

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="route-search">{location.search}</output>;
}

function renderPage(path = '/benefits') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } } });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[path]}>
                <LocationProbe />
                <Routes>
                    <Route path="/benefits" element={<Benefits />} />
                    <Route path="/benefits/:id" element={<BenefitDetail />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

function expectNewsOnlyStructure() {
    const heading = screen.getByRole('heading', { level: 1, name: BENEFITS_TITLE });
    expect(heading).toHaveAttribute('id', 'benefits-title');
    expect(heading).toHaveClass('reserve-discovery-visually-hidden');
    expect(heading.querySelector('br')).toBeNull();
    expect(screen.getByRole('region', { name: BENEFITS_TITLE })).toHaveAttribute('aria-labelledby', 'benefits-title');
    expect(screen.getByRole('region', { name: '가게 소식' })).toHaveAttribute('id', 'benefit-news');
    expect(screen.queryByRole('navigation', { name: '소식과 가게 탐색' })).not.toBeInTheDocument();
    expect(document.querySelector('.reserve-benefits-intro, .reserve-benefits-menu')).toBeNull();
    expect(document.querySelector('.reserve-benefits-campaign, .reserve-benefits-campaign-art')).toBeNull();
    expect(screen.queryByText('RESERVE BENEFITS')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '일반 가게 탐색' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '가게가 전하는 소식' })).not.toBeInTheDocument();
    expect(screen.queryByText(/개 소식|쿠폰 발급·사용 기능/)).not.toBeInTheDocument();
    return heading;
}

describe('actual photo benefits banners without invented campaign or general store discovery', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        window.scrollTo = vi.fn();
    });

    it('shows six matching row skeletons without decorative menu cards or invented promotions while loading', () => {
        benefitService.getList.mockReturnValue(new Promise(() => {}));
        renderPage();

        expectNewsOnlyStructure();
        const loading = screen.getByRole('status', { name: '가게 소식을 불러오는 중' });
        expect(loading).toHaveAttribute('aria-busy', 'true');
        const rows = loading.parentElement.querySelectorAll('.reserve-benefit-row--skeleton');
        expect(rows).toHaveLength(6);
        for (const row of rows) {
            expect(row).toHaveAttribute('aria-hidden', 'true');
            expect(row.querySelector('.reserve-benefit-media')).not.toBeNull();
            expect(row.querySelector('.reserve-benefit-row-copy')).not.toBeNull();
        }
        expect(loading.parentElement.querySelector('img, a, button')).toBeNull();
        expect(screen.queryByText(/쿠폰|발급|선착순|할인|오늘만/)).not.toBeInTheDocument();
    });

    it('provides one real store-discovery link and no image in a genuinely empty news state', async () => {
        benefitService.getList.mockResolvedValue({ content: [], page: { totalElements: 0 } });
        renderPage();
        await screen.findByText('아직 등록된 가게 소식이 없어요.');

        expectNewsOnlyStructure();
        const empty = screen.getByText('아직 등록된 가게 소식이 없어요.').closest('section');
        const link = within(empty).getByRole('link', { name: '가게 둘러보기' });
        expect(link.tagName).toBe('A');
        expect(link).toHaveAttribute('href', '/stores');
        expect(empty.querySelector('img, button')).toBeNull();
        expect(screen.getAllByRole('link')).toHaveLength(1);
    });

    it('keeps news-only structure and distinguishes failure, explicit retry, and genuine zero', async () => {
        benefitService.getList.mockRejectedValueOnce(new Error('news offline'))
            .mockResolvedValueOnce({ content: [], page: { totalElements: 0 } });
        renderPage();

        await screen.findByText('가게 소식을 불러오지 못했어요.');
        expectNewsOnlyStructure();
        expect(screen.getByRole('alert')).toHaveTextContent('가게 소식을 불러오지 못했어요.');
        expect(screen.queryByText('아직 등록된 가게 소식이 없어요.')).not.toBeInTheDocument();
        expect(screen.queryByText('0개 소식')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));

        await screen.findByText('아직 등록된 가게 소식이 없어요.');
        expectNewsOnlyStructure();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: '가게 둘러보기' })).toHaveAttribute('href', '/stores');
        expect(screen.queryByRole('button', { name: /쿠폰/ })).not.toBeInTheDocument();
        expect(benefitService.getList).toHaveBeenCalledTimes(2);
    });

    it('renders only actual store name, excerpt, and title within one photo banner link', async () => {
        benefitService.getList.mockResolvedValue({ content: [item], page: { totalElements: 1 } });
        renderPage();

        const link = await screen.findByRole('link', { name: `${item.storeName} · ${item.title} 소식 보기` });
        expect(link).toHaveAttribute('href', '/benefits/7');
        expect(within(link).getByRole('heading', { level: 2, name: item.storeName })).toHaveClass('reserve-benefit-store');
        expect(link.querySelector('.reserve-benefit-description').textContent).toBe(item.excerpt);
        expect(link.querySelector('.reserve-benefit-ticket').textContent).toBe(item.title);
        expect(link.querySelector('time, a, button')).toBeNull();
        expect(screen.getAllByRole('link')).toHaveLength(1);
        expectNewsOnlyStructure();
    });

    it('preserves 12-item news pagination and other URL state in both directions', async () => {
        benefitService.getList.mockResolvedValue({ content: [item], page: { totalElements: 37 } });
        renderPage('/benefits?page=2&domain=CAFE&sort=rating&storePage=3');
        await screen.findByRole('link', { name: `${item.storeName} · ${item.title} 소식 보기` });
        expect(BENEFIT_PAGE_SIZE).toBe(12);
        expect(benefitService.getList).toHaveBeenCalledWith({ page: 1, size: 12 }, expect.any(AbortSignal));

        fireEvent.click(within(screen.getByRole('navigation', { name: '가게 소식 페이지' })).getByTitle('3'));
        await waitFor(() => expect(benefitService.getList).toHaveBeenCalledWith({ page: 2, size: 12 }, expect.any(AbortSignal)));
        let params = new URLSearchParams(screen.getByTestId('route-search').textContent);
        expect(Object.fromEntries(params)).toEqual({ page: '3', domain: 'CAFE', sort: 'rating', storePage: '3' });

        await waitFor(() => expect(document.querySelector('.reserve-benefit-list')).toHaveAttribute('aria-busy', 'false'));
        fireEvent.click(within(screen.getByRole('navigation', { name: '가게 소식 페이지' })).getByTitle('1'));
        await waitFor(() => expect(benefitService.getList).toHaveBeenCalledWith({ page: 0, size: 12 }, expect.any(AbortSignal)));
        params = new URLSearchParams(screen.getByTestId('route-search').textContent);
        expect(Object.fromEntries(params)).toEqual({ domain: 'CAFE', sort: 'rating', storePage: '3' });
    });

    it.each(['0', '-4', '1.5', '10001', 'bad', '9007199254740992'])('falls back to API page zero for invalid URL page %s', async page => {
        benefitService.getList.mockResolvedValue({ content: [], page: { totalElements: 0 } });
        renderPage(`/benefits?page=${page}&storePage=4`);
        await screen.findByText('아직 등록된 가게 소식이 없어요.');

        expect(benefitService.getList).toHaveBeenCalledWith({ page: 0, size: 12 }, expect.any(AbortSignal));
        const params = new URLSearchParams(screen.getByTestId('route-search').textContent);
        expect(params.has('page')).toBe(false);
        expect(params.get('storePage')).toBe('4');
        expectNewsOnlyStructure();
    });

    it('first queries the safe upper page bound then normalizes a successful zero result to page one', async () => {
        benefitService.getList.mockResolvedValue({ content: [], page: { totalElements: 0 } });
        renderPage('/benefits?page=10000&storePage=4');
        await screen.findByText('아직 등록된 가게 소식이 없어요.');

        expect(benefitService.getList).toHaveBeenCalledWith({ page: 9999, size: 12 }, expect.any(AbortSignal));
        await waitFor(() => expect(benefitService.getList).toHaveBeenCalledWith({ page: 0, size: 12 }, expect.any(AbortSignal)));
        const params = new URLSearchParams(screen.getByTestId('route-search').textContent);
        expect(params.has('page')).toBe(false);
        expect(params.get('storePage')).toBe('4');
        expectNewsOnlyStructure();
    });

    it('normalizes an overrun successful page without confusing empty-page data with no registered news', async () => {
        benefitService.getList.mockResolvedValue({ content: [], page: { totalElements: 13 } });
        renderPage('/benefits?page=3&domain=CAFE&sort=rating&storePage=4');

        await screen.findByText('이 페이지에는 소식이 없어요.');
        expect(screen.queryByText('아직 등록된 가게 소식이 없어요.')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: '첫 페이지로' })).toHaveAttribute('href', '/benefits?domain=CAFE&sort=rating&storePage=4');
        expect(document.querySelector('.reserve-benefits-empty img')).toBeNull();
        expect(benefitService.getList).toHaveBeenCalledWith({ page: 2, size: 12 }, expect.any(AbortSignal));
        await waitFor(() => expect(benefitService.getList).toHaveBeenCalledWith({ page: 1, size: 12 }, expect.any(AbortSignal)));
        expect(Object.fromEntries(new URLSearchParams(screen.getByTestId('route-search').textContent)))
            .toEqual({ page: '2', domain: 'CAFE', sort: 'rating', storePage: '4' });
        expectNewsOnlyStructure();
    });

    it('does not normalize a valid requested page from the missing total of a failed response', async () => {
        benefitService.getList.mockRejectedValue(new Error('news offline'));
        renderPage('/benefits?page=4&domain=CAFE&storePage=3');

        await screen.findByText('가게 소식을 불러오지 못했어요.');
        expect(benefitService.getList).toHaveBeenCalledTimes(1);
        expect(benefitService.getList).toHaveBeenCalledWith({ page: 3, size: 12 }, expect.any(AbortSignal));
        expect(Object.fromEntries(new URLSearchParams(screen.getByTestId('route-search').textContent)))
            .toEqual({ page: '4', domain: 'CAFE', storePage: '3' });
        expect(screen.queryByText('0개 소식')).not.toBeInTheDocument();
        expectNewsOnlyStructure();
    });

    it('keeps long HTML-like store name, title, and excerpt as literal text with one nonnested banner link', () => {
        const title = '<img src=x onerror="window.hacked=true">' + '긴 소식 제목'.repeat(70);
        const storeName = '<script>window.hacked=true</script>' + '긴 가게 이름'.repeat(60);
        const excerpt = '<script>window.hacked=true</script>\n' + '원문 발췌'.repeat(90);
        render(<MemoryRouter><BenefitRow item={{ ...item, storeName, title, excerpt }} /></MemoryRouter>);

        const link = screen.getByRole('link', { name: `${storeName} · ${title} 소식 보기` });
        expect(link).toHaveAttribute('href', '/benefits/7');
        expect(link).toHaveClass('reserve-benefit-row');
        expect(within(link).getByRole('heading', { level: 2 }).textContent).toBe(storeName);
        expect(link.querySelector('.reserve-benefit-ticket').textContent).toBe(title);
        expect(link.querySelector('p').textContent).toBe(excerpt);
        expect(link.querySelector('script, [onerror], a, button, input, select, textarea, [role="button"]')).toBeNull();
        const image = link.querySelector('img');
        const store = link.querySelector('.reserve-benefit-store');
        expect(image).toHaveAttribute('alt', '');
        expect(image).toHaveAttribute('src', item.mainImageUrl);
        expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
        expect(image.compareDocumentPosition(store) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(store.compareDocumentPosition(link.querySelector('.reserve-benefit-ticket')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(link.querySelector('time')).toBeNull();
    });

    it('never loads an arbitrary external card photo and falls back after an owned photo error', () => {
        const { rerender } = render(<MemoryRouter><BenefitRow item={{ ...item, mainImageUrl: 'https://tracker.example/photo.png' }} /></MemoryRouter>);
        expect(document.querySelector('.reserve-benefit-thumbnail')).toHaveAttribute('src', BENEFIT_IMAGE_FALLBACK);
        rerender(<MemoryRouter><BenefitRow item={item} /></MemoryRouter>);
        const image = document.querySelector('.reserve-benefit-thumbnail');
        expect(image).toHaveAttribute('src', item.mainImageUrl);
        fireEvent.error(image);
        expect(image).toHaveAttribute('src', BENEFIT_IMAGE_FALLBACK);
    });

    it('resets a failed photo on source change and does not retry a repeatedly failed fallback', () => {
        const { rerender } = render(<MemoryRouter><BenefitRow item={item} /></MemoryRouter>);
        let image = document.querySelector('.reserve-benefit-thumbnail');
        expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
        fireEvent.error(image);
        expect(image).toHaveAttribute('src', BENEFIT_IMAGE_FALLBACK);
        expect(image.parentElement).toHaveClass('reserve-benefit-media--placeholder');
        fireEvent.error(image);
        fireEvent.error(image);
        expect(document.querySelector('.reserve-benefit-thumbnail')).toBe(image);
        expect(image).toHaveAttribute('src', BENEFIT_IMAGE_FALLBACK);

        const nextSource = 'https://cdn.reserve.it.kr/users/1/stores/12/thumbnails/new-menu.png';
        rerender(<MemoryRouter><BenefitRow item={{ ...item, mainImageUrl: nextSource }} /></MemoryRouter>);
        image = document.querySelector('.reserve-benefit-thumbnail');
        expect(image).toHaveAttribute('src', nextSource);
        expect(image.parentElement).not.toHaveClass('reserve-benefit-media--placeholder');
        fireEvent.error(image);
        expect(image).toHaveAttribute('src', BENEFIT_IMAGE_FALLBACK);
        fireEvent.error(image);
        expect(image).toHaveAttribute('src', BENEFIT_IMAGE_FALLBACK);

        rerender(<MemoryRouter><BenefitRow item={{ ...item, mainImageUrl: 'javascript:alert(1)' }} /></MemoryRouter>);
        image = document.querySelector('.reserve-benefit-thumbnail');
        fireEvent.error(image);
        expect(image).toHaveAttribute('src', BENEFIT_IMAGE_FALLBACK);
        expect(image.parentElement).toHaveClass('reserve-benefit-media--placeholder');
        expect(document.querySelectorAll('.reserve-benefit-thumbnail')).toHaveLength(1);
    });

    it.each([404, 410, 403])('does not automatically retry permanent detail status %s and keeps a safe fallback', async (status) => {
        benefitService.getDetail.mockRejectedValue(Object.assign(new Error('not public'), { response: { status } }));
        renderPage('/benefits/7');

        await screen.findByText(status === 403 ? '가게 소식을 불러오지 못했어요.' : '현재 공개된 가게 소식이 아니에요.');
        expect(benefitService.getDetail).toHaveBeenCalledWith('7', expect.any(AbortSignal));
        expect(benefitService.getDetail).toHaveBeenCalledTimes(1);
        if (status === 403) {
            expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument();
        } else {
            expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument();
            expect(screen.getByRole('link', { name: '소식 목록으로' })).toHaveAttribute('href', '/benefits');
        }
    });

    it('permits explicit detail retry and renders only original text and guarded store photo', async () => {
        benefitService.getDetail.mockRejectedValueOnce(new Error('detail offline'))
            .mockRejectedValueOnce(new Error('still offline'))
            .mockResolvedValueOnce({ ...item, mainImageUrl: 'https://tracker.example/photo.png' });
        renderPage('/benefits/7');

        await screen.findByText('가게 소식을 불러오지 못했어요.');
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByRole('heading', { level: 1, name: item.title })).toBeInTheDocument();
        expect(document.querySelector('.reserve-benefit-detail-content').textContent).toBe(item.content);
        expect(document.querySelector('.reserve-benefit-detail-content script, .reserve-benefit-detail-content img')).toBeNull();
        expect(screen.getByRole('img', { name: '가게 사진이 등록되지 않았습니다' })).toHaveAttribute('src', BENEFIT_IMAGE_FALLBACK);
        expect(screen.getByRole('link', { name: '가게 보기 →' })).toHaveAttribute('href', '/store/12');
        expect(benefitService.getDetail).toHaveBeenCalledTimes(3);
    });

    it('keeps actual service methods on public GET endpoints with signal and auth-refresh opt-out', async () => {
        const { default: actualService } = await vi.importActual('../../services/benefitService');
        const signal = new AbortController().signal;
        const params = { page: 1, size: 12 };

        actualService.getList(params, signal);
        actualService.getDetail('7', signal);

        expect(api.get).toHaveBeenNthCalledWith(1, '/api/promotions/public', { params, signal, skipAuthRefresh: true });
        expect(api.get).toHaveBeenNthCalledWith(2, '/api/promotions/public/7', { signal, skipAuthRefresh: true });
        expect(api.get).toHaveBeenCalledTimes(2);
    });
});
