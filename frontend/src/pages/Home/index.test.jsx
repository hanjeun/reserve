import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Home from './index';
import { storeService, tourismService } from '../../services';

const { navigate, locationRequest, setLiveLocation, messageInfo, locationState } = vi.hoisted(() => ({
    navigate: vi.fn(),
    locationRequest: vi.fn(),
    setLiveLocation: vi.fn(),
    messageInfo: vi.fn(),
    locationState: { requesting: false, user: null },
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../services', () => ({
    storeService: { getStores: vi.fn(), getRegions: vi.fn() },
    tourismService: { getRegionPhotos: vi.fn() },
}));

vi.mock('../../hooks/useGeolocation', () => ({
    default: () => ({ request: locationRequest, requesting: locationState.requesting }),
}));

vi.mock('../../hooks/useMessage', () => ({
    default: () => ({ message: { info: messageInfo } }),
}));

vi.mock('../../store/useAuthStore', () => ({
    default: selector => selector({ user: locationState.user }),
}));

vi.mock('../../store/useLocationStore', () => ({
    default: selector => selector({ setLiveLocation }),
}));

const renderHome = (initialEntries = ['/']) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={initialEntries}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/store/:id" element={<p>가게 상세 화면</p>} />
                    <Route path="/stores" element={<BannerDestination />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    );
};

function BannerDestination() {
    const location = useLocation();
    return <output data-testid="banner-entry">{location.state?.reserveDiscoveryEntry}</output>;
}

const prepareBannerScroll = () => {
    const section = screen.getByRole('region', { name: '서비스 추천' });
    const track = section.querySelector('.reserve-discovery-banner-track');
    Object.defineProperties(track, {
        clientWidth: { configurable: true, value: 400 },
        scrollWidth: { configurable: true, value: 1220 },
        scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    Array.from(track.children).forEach((slide, index) => {
        Object.defineProperty(slide, 'offsetLeft', { configurable: true, value: index * 410 });
    });
    track.scrollTo = vi.fn(({ left }) => {
        track.scrollLeft = left;
        fireEvent.scroll(track);
    });
    return { section, track };
};

describe('app discovery home', () => {
    beforeEach(() => {
        navigate.mockClear();
        locationRequest.mockReset();
        locationRequest.mockResolvedValue(null);
        setLiveLocation.mockClear();
        messageInfo.mockClear();
        locationState.requesting = false;
        locationState.user = null;
        window.scrollTo = vi.fn();
        storeService.getStores.mockReset();
        storeService.getRegions.mockReset();
        tourismService.getRegionPhotos.mockReset();
        tourismService.getRegionPhotos.mockResolvedValue([]);
        storeService.getStores.mockResolvedValue({
            content: [{ id: 3, name: '모던 필라테스', rating: 4.9, reviewCount: 10 }],
        });
        storeService.getRegions.mockResolvedValue([
            { name: '서울', count: 2, areas: [{ name: '종로구', count: 2 }] },
            { name: '경기', count: 1, areas: [{ name: '안산시', count: 1 }] },
        ]);
    });

    it('shows the operation-guide photo as the first home banner, service domains, and recommended stores', async () => {
        renderHome();

        const guide = screen.getByRole('link', { name: 'RESERVE 운영 안내 보기' });
        expect(guide).toHaveAttribute('href', '/operation-guide');
        expect(guide).toHaveClass('reserve-discovery-banner', 'reserve-discovery-banner--current');
        expect(guide.querySelector('img')).toHaveAttribute('src', '/images/discovery-v3/operation-guide-cover-v1.webp');
        expect(within(guide).getByText('RESERVE 이용 안내')).toBeInTheDocument();
        expect(guide).toHaveTextContent(/예약 전에 확인하면,\s*더 편리해요/);
        expect(within(guide).getByText('예약·결제·취소 기준을 한눈에 확인하세요')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '운동 · 웰니스 가게 둘러보기' }))
            .toHaveAttribute('href', '/stores?domain=SPORTS');
        expect(await screen.findByText('모던 필라테스')).toBeInTheDocument();
        expect(storeService.getStores).toHaveBeenCalledWith({ page: 0, size: 4, sort: 'rating' });
    });

    it('keeps the guide copy inside the hero link rather than a separately loaded notice block', async () => {
        renderHome();

        expect(screen.getAllByRole('link', { name: 'RESERVE 운영 안내 보기' })).toHaveLength(1);
        expect(screen.queryByText('예약 확인부터 가게 운영과 광고 관리까지 필요한 흐름을 안내합니다.')).toBeNull();
    });

    it('marks the active snapped banner and passes a scoped entrance hint to its store destination', async () => {
        const user = userEvent.setup();
        renderHome();
        const banners = screen.getAllByRole('link', { name: /둘러보기$/ }).filter(link => link.classList.contains('reserve-discovery-banner'));
        expect(banners).toHaveLength(3);
        expect(screen.getByRole('link', { name: 'RESERVE 운영 안내 보기' })).toHaveClass('reserve-discovery-banner--current');
        expect(banners[0]).not.toHaveClass('reserve-discovery-banner--current');
        expect(banners[1]).not.toHaveClass('reserve-discovery-banner--current');
        await user.click(banners[0]);
        expect(screen.getByTestId('banner-entry')).toHaveTextContent('featured-banner');
    });

    it('auto-advances only while the featured banner is visible and pauses for pointer attention', () => {
        vi.useFakeTimers();
        try {
            let reportVisibility;
            const originalObserver = globalThis.IntersectionObserver;
            globalThis.IntersectionObserver = class IntersectionObserver {
                constructor(callback) { reportVisibility = callback; }
                observe() {}
                disconnect() {}
            };
            try {
                renderHome();
                const { section, track } = prepareBannerScroll();
                act(() => { vi.advanceTimersByTime(6000); });
                expect(track.scrollTo).not.toHaveBeenCalled();
                act(() => { reportVisibility([{ isIntersecting: true, intersectionRatio: 0.01 }]); });
                act(() => { vi.advanceTimersByTime(6000); });
                expect(track.scrollTo).not.toHaveBeenCalled();
                act(() => { reportVisibility([{ isIntersecting: true, intersectionRatio: 0.5 }]); });
                act(() => { vi.advanceTimersByTime(6000); });
                expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 410, behavior: 'smooth' });
                expect(section.querySelector('.reserve-discovery-banner-next')).toHaveTextContent('2 / 4');

                fireEvent.pointerEnter(section, { pointerType: 'mouse' });
                act(() => { vi.advanceTimersByTime(6000); });
                expect(track.scrollTo).toHaveBeenCalledTimes(1);
                fireEvent.pointerLeave(section, { pointerType: 'mouse' });
                act(() => { vi.advanceTimersByTime(6000); });
                expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 820, behavior: 'smooth' });
            } finally {
                globalThis.IntersectionObserver = originalObserver;
            }
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not auto-advance in reduced-motion mode but keeps manual banner navigation', () => {
        const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
            matches: query.includes('prefers-reduced-motion'),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
        }));
        vi.useFakeTimers();
        try {
            renderHome();
            const { section, track } = prepareBannerScroll();
            act(() => { vi.advanceTimersByTime(12000); });
            expect(track.scrollTo).not.toHaveBeenCalled();
            fireEvent.click(section.querySelector('.reserve-discovery-banner-next'));
            expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 410, behavior: 'auto' });
        } finally {
            vi.useRealTimers();
            matchMedia.mockRestore();
        }
    });

    it('keeps the slide indicator usable when ResizeObserver is unavailable', () => {
        const originalObserver = globalThis.ResizeObserver;
        globalThis.ResizeObserver = undefined;
        try {
            renderHome();
            const { section, track } = prepareBannerScroll();
            track.scrollLeft = 410;
            fireEvent(window, new Event('resize'));
            expect(section.querySelector('.reserve-discovery-banner-next')).toHaveTextContent('2 / 4');
        } finally {
            globalThis.ResizeObserver = originalObserver;
        }
    });

    it('reuses the store list row for recommendations: photo, name, description, rating and category without address', async () => {
        storeService.getStores.mockResolvedValue({ content: [
            { id: 3, name: '모던 필라테스', description: '소규모 레슨 안내', category: '운동', address: '서울시 중구', rating: 4.9, reviewCount: 10, mainImageUrl: 'https://cdn.reserve.it.kr/users/1/stores/3/thumbnails/cover.png', mainImageWidth: 960, mainImageHeight: 640 },
            { id: 4, name: '작은 공방', mainImageUrl: '/uploads/square.png', mainImageWidth: 512, mainImageHeight: 512, reviewCount: 0 },
        ] });
        renderHome();
        const first = await screen.findByRole('link', { name: '모던 필라테스 상세 보기' });
        expect(first).toHaveClass('reserve-store-list-row-link');
        expect(first.closest('ul')).toHaveClass('reserve-discovery-store-list', 'reserve-store-list-rows');
        expect(first).toHaveAttribute('href', '/store/3');
        const photo = within(first).getByRole('img', { name: '모던 필라테스 대표 이미지' });
        expect(photo).toHaveAttribute('src', 'https://cdn.reserve.it.kr/users/1/stores/3/thumbnails/cover.png');
        expect(photo).toHaveAttribute('width', '160');
        expect(photo).toHaveAttribute('height', '160');
        expect(photo).toHaveAttribute('loading', 'lazy');
        const body = first.querySelector('.reserve-store-list-row-body');
        expect(photo.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(body.firstElementChild).toHaveTextContent('모던 필라테스');
        expect(body.children[1]).toHaveClass('reserve-store-list-row-description');
        expect(body.children[2]).toHaveClass('reserve-store-list-row-meta');
        const meta = body.lastElementChild;
        expect(meta.firstElementChild).toHaveClass('reserve-store-list-row-rating');
        expect(meta.lastElementChild).toHaveClass('reserve-store-identity-text');
        expect(within(first).getByText('4.9')).toBeInTheDocument();
        expect(within(first).getByText('(10)')).toBeInTheDocument();
        expect(within(first).getByText('소규모 레슨 안내')).toBeInTheDocument();
        expect(within(first).getByText('운동')).toBeInTheDocument();
        expect(within(first).queryByText(/서울시 중구/)).toBeNull();
        expect(first.querySelector('a, button, input, [role="button"]')).toBeNull();
        const second = screen.getByRole('link', { name: '작은 공방 상세 보기' });
        const square = within(second).getByRole('img');
        expect(square.getAttribute('src')).toMatch(/\/uploads\/square\.png$/);
        expect(within(second).getByText('0.0')).toBeInTheDocument();
        expect(within(second).getByText('(0)')).toBeInTheDocument();
        expect(second.querySelector('.reserve-store-list-row-rating svg').closest('[aria-hidden="true"]')).toBeTruthy();
        expect(within(second).queryByText('아직 리뷰가 없어요')).toBeNull();
        expect(second.querySelector('.reserve-store-list-row-description')).toBeNull();
    });

    it.each([
        { rating: 4.8, reviewCount: 0, score: '0.0', count: '(0)' },
        { rating: '4.7', reviewCount: '1234', score: '4.7', count: '(1,234)' },
        { rating: 'invalid', reviewCount: 3, score: '0.0', count: '(3)' },
    ])('uses the shared safe rating/count summary in recommendations: %j', async (values) => {
        storeService.getStores.mockResolvedValue({ content: [{ id: 3, name: '추천 가게', ...values }] });
        renderHome();
        const card = await screen.findByRole('link', { name: '추천 가게 상세 보기' });
        expect(within(card).getByText(values.score)).toBeInTheDocument();
        expect(within(card).getByText(values.count)).toBeInTheDocument();
        expect(within(card).queryByText('아직 리뷰가 없어요')).toBeNull();
        expect(card).not.toHaveTextContent('NaN');
    });

    it('opens the real detail route by keyboard from a recommendation card', async () => {
        const user = userEvent.setup();
        renderHome();
        const link = await screen.findByRole('link', { name: '모던 필라테스 상세 보기' });
        link.focus();
        expect(link).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(await screen.findByText('가게 상세 화면')).toBeInTheDocument();
    });

    it('shows four store-list-row skeletons while the store query is pending', async () => {
        let resolve;
        const promise = new Promise(success => { resolve = success; });
        storeService.getStores.mockReturnValueOnce(promise);
        renderHome();
        const grid = screen.getByRole('status', { name: '추천 가게를 불러오는 중' });
        expect(grid).toHaveClass('reserve-discovery-store-list', 'reserve-store-list-rows');
        expect(grid).toHaveAttribute('aria-busy', 'true');
        expect(grid.children).toHaveLength(4);
        Array.from(grid.children).forEach(card => {
            expect(card).toHaveClass('reserve-store-list-row', 'reserve-store-list-row-skeleton');
            expect(card.querySelector('.reserve-store-list-row-image')).toBeTruthy();
            expect(card.querySelector('.reserve-store-list-row-body .reserve-store-list-row-meta')).toBeTruthy();
            expect(card.querySelector('a, button')).toBeNull();
        });
        await act(async () => {
            resolve({ content: [{ id: 3, name: '모던 필라테스' }] });
            await promise;
        });
        expect(await screen.findByRole('link', { name: '모던 필라테스 상세 보기' })).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: '추천 가게를 불러오는 중' })).toBeNull();
    });

    it('keeps successful no-store results separate from recommendation failures', async () => {
        storeService.getStores.mockResolvedValue({ content: [] });
        renderHome();
        expect(await screen.findByText('아직 추천할 가게가 없습니다.')).toBeInTheDocument();
        expect(screen.queryByText('추천 가게를 불러오지 못했어요.')).toBeNull();
        expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull();
        expect(screen.getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/stores?sort=rating');
    });

    it('preserves the error retry without turning a failed request into empty cards', async () => {
        const user = userEvent.setup();
        storeService.getStores.mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue({ content: [{ id: 3, name: '모던 필라테스', rating: 4.9, reviewCount: 10 }] });
        renderHome();
        expect(await screen.findByText('추천 가게를 불러오지 못했어요.')).toBeInTheDocument();
        expect(screen.queryByText('아직 추천할 가게가 없습니다.')).toBeNull();
        await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByRole('link', { name: '모던 필라테스 상세 보기' })).toBeInTheDocument();
        expect(storeService.getStores).toHaveBeenCalledTimes(2);
    });

    it('retains long HTML-like names and descriptions as literal, nonexecutable card text', async () => {
        const name = '<script>window.hacked=true</script>' + '긴 가게 이름'.repeat(30);
        const description = '<img src=x onerror="window.hacked=true">' + '원문 안내'.repeat(50);
        storeService.getStores.mockResolvedValue({ content: [{ id: 3, name, description, rating: 4.76, reviewCount: 1234 }] });
        renderHome();
        const card = await screen.findByRole('link', { name: `${name} 상세 보기` });
        expect(card.querySelector('strong').textContent).toBe(name);
        expect(card.querySelector('.reserve-store-list-row-description').textContent).toBe(description);
        expect(within(card).getByText('4.8')).toBeInTheDocument();
        expect(within(card).getByText('(1,234)')).toBeInTheDocument();
        expect(card.querySelector('script, img[src="x"], [onerror]')).toBeNull();
    });

    it('keeps search in the shared header and does not request location on entry', () => {
        renderHome();

        expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '현재 위치로' })).toBeEnabled();
        expect(screen.getByRole('button', { name: '전체 지역' })).toHaveAttribute('aria-haspopup', 'dialog');
        expect(locationRequest).not.toHaveBeenCalled();
    });

    it('opens the shared region sheet and applies a real district to recommendations and links', async () => {
        const user = userEvent.setup();
        renderHome();

        await user.click(screen.getByRole('button', { name: '전체 지역' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('지역 선택')).toBeInTheDocument();
        expect(within(dialog).getByText('제주특별자치도')).toBeInTheDocument();
        await user.click(within(dialog.querySelector('.reserve-region-sheet-groups')).getByRole('button', { name: /서울특별시/ }));
        await user.click(within(dialog.querySelector('.reserve-region-sheet-areas')).getByRole('button', { name: /종로구/ }));
        await user.click(within(dialog).getByRole('button', { name: '서울특별시 종로구 적용' }));

        await waitFor(() => expect(storeService.getStores).toHaveBeenCalledWith({
            page: 0, size: 4, sort: 'rating', region: '서울 종로구',
        }));
        expect(within(document.querySelector('.reserve-discovery-location')).getByRole('button', { name: '서울특별시 종로구' }))
            .toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/stores?sort=rating&region=%EC%84%9C%EC%9A%B8+%EC%A2%85%EB%A1%9C%EA%B5%AC');
        expect(screen.getByRole('link', { name: /오늘의 한 끼/ })).toHaveAttribute('href', '/stores?domain=FOOD&region=%EC%84%9C%EC%9A%B8+%EC%A2%85%EB%A1%9C%EA%B5%AC');
        expect(locationRequest).not.toHaveBeenCalled();
    });

    it('allows a zero-store province, shows its empty state, and resets back to nationwide', async () => {
        const user = userEvent.setup();
        storeService.getStores.mockImplementation(async params => ({
            content: params.region ? [] : [{ id: 3, name: '모던 필라테스' }],
        }));
        renderHome();

        await user.click(screen.getByRole('button', { name: '전체 지역' }));
        let dialog = await screen.findByRole('dialog');
        await user.click(within(dialog.querySelector('.reserve-region-sheet-groups')).getByRole('button', { name: /제주특별자치도/ }));
        expect(within(dialog).getByText(/현재 등록된 가게가 없습니다/)).toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: '제주특별자치도 적용' }));
        expect(await screen.findByText('이 지역에 등록된 가게가 없습니다.')).toBeInTheDocument();
        expect(storeService.getStores).toHaveBeenCalledWith({ page: 0, size: 4, sort: 'rating', region: '제주' });

        await user.click(screen.getByRole('button', { name: '제주특별자치도' }));
        dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: '초기화' }));
        await user.click(within(dialog).getByRole('button', { name: '전국 적용' }));
        expect(await screen.findByRole('link', { name: '모던 필라테스 상세 보기' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '전체 지역' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/stores?sort=rating');
    });

    it('dismisses the region sheet with Escape without changing the selected region', async () => {
        const user = userEvent.setup();
        renderHome();
        await user.click(screen.getByRole('button', { name: '전체 지역' }));
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        await user.keyboard('{Escape}');
        expect(screen.getByRole('button', { name: '전체 지역' })).toHaveAttribute('aria-expanded', 'false');
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
    });

    it('requests location only after a click and opens nearby stores with rounded coordinates', async () => {
        const user = userEvent.setup();
        const position = { latitude: 37.321234, longitude: 126.812876 };
        locationRequest.mockResolvedValue(position);
        renderHome();

        expect(locationRequest).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '현재 위치로' }));

        expect(locationRequest).toHaveBeenCalledTimes(1);
        expect(setLiveLocation).toHaveBeenCalledWith(position);
        expect(navigate).toHaveBeenCalledWith('/stores?sort=distance&lat=37.321&lng=126.813');
    });

    it('keeps the selected region when moving from home to distance sort', async () => {
        const user = userEvent.setup();
        locationRequest.mockResolvedValue({ latitude: 37.321234, longitude: 126.812876 });
        renderHome(['/\u003fregion=서울 종로구']);

        await user.click(screen.getByRole('button', { name: '현재 위치로' }));

        expect(navigate).toHaveBeenCalledWith('/stores?sort=distance&lat=37.321&lng=126.813&region=%EC%84%9C%EC%9A%B8+%EC%A2%85%EB%A1%9C%EA%B5%AC');
    });

    it('stays on home when location is unavailable and no saved address exists', async () => {
        const user = userEvent.setup();
        renderHome();

        await user.click(screen.getByRole('button', { name: '현재 위치로' }));

        expect(locationRequest).toHaveBeenCalledTimes(1);
        expect(setLiveLocation).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('reuses the store list saved-address fallback without replacing live location', async () => {
        const user = userEvent.setup();
        locationState.user = { latitude: 37.580987, longitude: 126.979432 };
        renderHome();

        await user.click(screen.getByRole('button', { name: '현재 위치로' }));

        expect(messageInfo).toHaveBeenCalledWith('마이페이지에 등록된 위치 기준으로 정렬할게요.');
        expect(navigate).toHaveBeenCalledWith('/stores?sort=distance&lat=37.581&lng=126.979');
        expect(setLiveLocation).not.toHaveBeenCalled();
    });

    it('disables the location action while the existing hook is requesting', () => {
        locationState.requesting = true;
        renderHome();

        expect(screen.getByRole('button', { name: '위치 확인 중' }))
            .toBeDisabled();
        expect(screen.getByRole('button', { name: '위치 확인 중' }))
            .toHaveAttribute('aria-busy', 'true');
        expect(locationRequest).not.toHaveBeenCalled();
    });
});
