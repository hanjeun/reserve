import { Suspense, lazy } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import RouteLoadingSkeleton, { RouteSkeletonPreview } from './RouteLoadingSkeleton';
import { getRouteSkeletonKind } from './routeSkeletonKind';
import { preloadRouteSkeletons } from './routeSkeletonLoader';

const routes = {
    '/': 'discovery', '/search': 'search', '/benefits': 'benefits', '/benefits/1': 'benefit-detail', '/waiting': 'coming-soon', '/feed': 'coming-soon',
    '/login': 'auth', '/signup': 'auth', '/forgot-password': 'auth', '/oauth2/callback': 'document', '/signup/social': 'auth',
    '/stores': 'store-list', '/store/12': 'detail', '/terms': 'legal', '/privacy': 'legal', '/operation-guide': 'legal', '/content-sources': 'legal',
    '/my-stores': 'cards', '/store/register': 'store-form', '/store/12/edit': 'store-form', '/business': 'business', '/admin': 'admin',
    '/my-reservations': 'reservations', '/my-favorites': 'cards', '/payment/result': 'payment-result', '/my-page': 'my-page', '/messages': 'messages',
};

const originalWidth = window.innerWidth;
const setWidth = width => Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

describe('route chunk loading patterns', () => {
    // 페이지별 뼈대는 별도 청크다. 앱처럼 먼저 받아 두면 이후 렌더는 동기적으로 그 모양을 그린다.
    beforeAll(() => preloadRouteSkeletons());
    afterEach(() => setWidth(originalWidth));

    it('mirrors the search header, six domains and quick choices without a text input', () => {
        const { container } = render(<RouteSkeletonPreview pathname="/search" />);
        expect(container.querySelector('.reserve-search-header')).toBeInTheDocument();
        expect(container.querySelectorAll('.reserve-route-search-domain')).toHaveLength(6);
        expect(container.querySelectorAll('.reserve-search-keywords > div')).toHaveLength(6);
        expect(container.querySelector('input,button,a,form')).toBeNull();
    });

    it('mirrors my page profile, account editing and three app settings cards', () => {
        const { container } = render(<RouteSkeletonPreview pathname="/my-page" />);
        expect(container.querySelector('.reserve-page-container')).toHaveStyle({ maxWidth: '1000px', padding: '48px 24px 80px' });
        expect(container.querySelectorAll('.reserve-my-page-skeleton-card')).toHaveLength(5);
        expect(container.querySelector('.reserve-my-page-skeleton-grid')).toHaveStyle({ flexDirection: 'row' });
        expect(container.querySelector('input,button,a')).toBeNull();
    });
    it.each(Object.entries(routes))('covers %s without mounting interactive controls', (path, kind) => {
        expect(getRouteSkeletonKind(path)).toBe(kind);
        const { container } = render(<RouteSkeletonPreview pathname={path} />);
        expect(screen.getByRole('status', { name: '화면을 불러오는 중' })).toHaveAttribute('aria-busy', 'true');
        expect(container.querySelector('button,input,select,a,textarea')).toBeNull();
    });

    it.each([
        ['', '.rsv-store-grid > div'],
        ['?view=cards', '.rsv-store-grid > div'],
        ['?view=list', '.reserve-store-list-row-skeleton'],
    ])('keeps the /stores chunk and data loading at 12 placeholders for %s', (search, selector) => {
        const { container } = render(<RouteSkeletonPreview pathname="/stores" search={search} />);
        expect(container.querySelector('.reserve-route-store-toolbar')).toBeInTheDocument();
        expect(container.querySelectorAll(selector)).toHaveLength(12);
        expect(container.querySelector('button, a, img')).toBeNull();
        if (search !== '?view=list') {
            const info = container.querySelector('.reserve-store-card-skeleton-info');
            expect(Array.from(info.children, child => child.className)).toEqual([
                'reserve-store-card-skeleton-title-line',
                'reserve-store-card-skeleton-identity',
                'reserve-store-card-skeleton-rating',
            ]);
        }
    });

    it('mirrors the full home structure while its route chunk loads', () => {
        const { container } = render(<RouteSkeletonPreview pathname="/" />);
        const home = container.querySelector('.reserve-discovery-home');
        // 실제 홈과 같은 순서: 지역 줄 → 배너 → 바로가기(서비스 6 + 빠른 메뉴 4) → 추천. 홈에 없는 공지 줄은 없다.
        expect(Array.from(home.children, child => child.className)).toEqual([
            'reserve-discovery-location',
            'reserve-discovery-featured',
            'reserve-discovery-shortcuts',
            'reserve-discovery-recommended',
        ]);
        expect(container.querySelectorAll('.reserve-discovery-shortcut-group--services .reserve-discovery-shortcut')).toHaveLength(6);
        expect(container.querySelectorAll('.reserve-discovery-shortcut-group--quick .reserve-discovery-shortcut')).toHaveLength(4);
        expect(container.querySelectorAll('.reserve-discovery-shortcut-group-title')).toHaveLength(2);
        expect(container.querySelectorAll('.reserve-discovery-store-list .reserve-store-list-row-skeleton')).toHaveLength(4);
    });

    it('lets the reservation search bone shrink and keeps the refresh in the real refresh slot', () => {
        const { container } = render(<RouteSkeletonPreview pathname="/my-reservations" />);
        const row = container.querySelector('.reserve-filter-toolbar-secondary');
        expect(row.firstElementChild).toHaveStyle({ flexShrink: '1', minWidth: '0px', maxWidth: '480px' });
        expect(row.querySelector('.reserve-filter-toolbar-refresh > .reserve-skeleton-block')).toHaveStyle({ width: '70px', height: '16px' });
        expect(container.querySelector('.reserve-explore-filters')).toHaveStyle({ minHeight: '44px' });
    });

    it('keeps reservations at the real page width, heading and selected card layout', () => {
        const { container } = render(<RouteSkeletonPreview pathname="/my-reservations" search="?view=cards" />);
        expect(container.querySelector('h2')).toHaveTextContent('내 예약 확인');
        expect(container.querySelector('.reserve-page-container')).toHaveStyle({ maxWidth: '1200px', padding: '40px 24px 80px' });
        expect(container.querySelectorAll('.reserve-reservation-card-skeleton')).toHaveLength(4);
    });

    it('uses the favorites masonry grid and benefit rows rather than generic document bones', () => {
        const { container, rerender } = render(<RouteSkeletonPreview pathname="/my-favorites" />);
        expect(container.querySelector('.rsv-fav-grid')).toBeInTheDocument();
        expect(container.querySelector('.rsv-store-grid')).toBeNull();
        rerender(<RouteSkeletonPreview pathname="/benefits" />);
        expect(container.querySelectorAll('.reserve-benefit-row--skeleton')).toHaveLength(6);
    });

    it('uses the same saved view as the data page while the URL has no view parameter', () => {
        sessionStorage.setItem('reserve:view-mode:/my-stores', 'list');
        const { container } = render(<RouteSkeletonPreview pathname="/my-stores" />);
        expect(container.querySelectorAll('.reserve-store-list-row-skeleton')).toHaveLength(4);
        sessionStorage.removeItem('reserve:view-mode:/my-stores');
    });

    it.each([
        ['/login', '80px', '로그인', 2],
        ['/signup', '60px', '회원가입', 4],
        ['/forgot-password', '60px', '비밀번호 찾기', 1],
    ])('draws %s at the real auth frame with its own title and input count', (path, top, title, inputs) => {
        const { container } = render(<RouteSkeletonPreview pathname={path} />);
        expect(container.querySelector('.reserve-page-container')).toHaveStyle({ maxWidth: '420px', padding: `${top} 24px 80px`, minHeight: 'calc(100svh - 64px)' });
        expect(container.querySelector('h2')).toHaveTextContent(title);
        expect(Array.from(container.querySelectorAll('.reserve-skeleton-block')).filter(bone => bone.style.height === '54px')).toHaveLength(inputs);
    });

    it('keeps the three social login circles on the login skeleton', () => {
        const { container } = render(<RouteSkeletonPreview pathname="/login" />);
        expect(Array.from(container.querySelectorAll('.reserve-skeleton-block')).filter(bone => bone.style.width === '52px' && bone.style.borderRadius === '50%')).toHaveLength(3);
    });

    it.each([['/terms', '서비스 이용약관'], ['/privacy', '개인정보 처리방침'], ['/operation-guide', '운영 안내'], ['/content-sources', '콘텐츠 출처·권리 안내']])(
        'uses the md document frame for %s', (path, title) => {
            const { container } = render(<RouteSkeletonPreview pathname={path} />);
            expect(container.querySelector('.reserve-page-container')).toHaveStyle({ maxWidth: '700px', padding: '60px 24px 80px' });
            expect(container.querySelector('h2')).toHaveTextContent(title);
        });

    it('reuses the benefit detail data skeleton and the coming-soon frame', () => {
        const { container, rerender } = render(<RouteSkeletonPreview pathname="/benefits/3" />);
        expect(container.querySelector('.reserve-benefits-page.reserve-benefit-detail .reserve-route-skeleton-copy')).toBeInTheDocument();
        expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
        rerender(<RouteSkeletonPreview pathname="/waiting" />);
        expect(container.querySelector('.reserve-discovery-coming-soon h1')).toHaveTextContent('웨이팅은 아직 준비 중이에요');
        expect(container.querySelector('.reserve-discovery-coming-soon .reserve-route-skeleton-text')).toBeInTheDocument();
    });

    it('mirrors the payment verifying screen inside the 420px payment frame', () => {
        const { container } = render(<RouteSkeletonPreview pathname="/payment/result" />);
        expect(container.querySelector('.reserve-payment-result-page')).toHaveStyle({ maxWidth: '420px', padding: '56px 24px 80px' });
        expect(container.querySelector('.reserve-payment-result__content .reserve-payment-result__hint')).toBeInTheDocument();
    });

    it('draws the admin panel title, tabs, search toolbar and verification table', () => {
        const { container } = render(<RouteSkeletonPreview pathname="/admin" />);
        expect(container.querySelector('h2')).toHaveTextContent('관리자 패널');
        expect(container.querySelectorAll('.reserve-route-panel-tab')).toHaveLength(13);
        expect(container.querySelector('.reserve-filter-toolbar')).toBeInTheDocument();
        expect(container.textContent).toContain('사업자번호');
    });

    it('draws the partner panel reservation tab and only the header for other tabs', () => {
        const { container, rerender } = render(<RouteSkeletonPreview pathname="/business" />);
        expect(container.querySelector('h2')).toHaveTextContent('사업자 파트너 패널');
        expect(container.querySelectorAll('.reserve-route-panel-tab')).toHaveLength(5);
        expect(container.querySelector('.reserve-explore-filters')).toBeInTheDocument();
        // 사업자 예약 목록 뼈대(ReservationCardSkeleton): 행 5개 + 구분선 4개
        expect(container.querySelector('.reserve-filter-toolbar').nextElementSibling.children).toHaveLength(9);
        rerender(<RouteSkeletonPreview pathname="/business" search="?tab=analytics" />);
        expect(container.querySelector('.reserve-explore-filters')).toBeNull();
    });

    it('mirrors the mobile messenger home, a store thread, and stays blank on PC', () => {
        setWidth(390);
        const { container, unmount } = render(<RouteSkeletonPreview pathname="/messages" />);
        expect(container.querySelector('.reserve-messenger--page.is-home .reserve-messenger-brand-cover')).toBeInTheDocument();
        expect(container.querySelectorAll('.reserve-messenger-footer-tab')).toHaveLength(3);
        unmount();
        const thread = render(<RouteSkeletonPreview pathname="/messages" search="?storeId=4" />);
        expect(thread.container.querySelector('.reserve-messenger.has-mobile-thread .reserve-messenger-thread-skeleton')).toBeInTheDocument();
        thread.unmount();
        setWidth(1280);
        const pc = render(<RouteSkeletonPreview pathname="/messages" />);
        expect(pc.container.querySelector('.reserve-messenger')).toBeNull();
    });

    it.each([[820, '700px', '20px 24px 80px'], [1280, '1200px', '32px 24px 80px']])(
        'frames store detail like the page at %ipx', (width, maxWidth, padding) => {
            setWidth(width);
            const { container } = render(<RouteSkeletonPreview pathname="/store/12" />);
            expect(container.querySelector('.reserve-page-container')).toHaveStyle({ maxWidth, padding });
        });

    it('renders the store form skeleton with the edit title on the edit route', () => {
        const { container } = render(<RouteSkeletonPreview pathname="/store/12/edit" />);
        expect(container.querySelector('.reserve-store-form-heading h2')).toHaveTextContent('가게 정보 수정');
    });

    it('keeps the minimum page height while the page skeleton chunk is still on its way', async () => {
        vi.resetModules();
        let release;
        vi.doMock('./RouteSkeletonPages', () => new Promise(resolve => { release = resolve; }));
        const { RouteSkeletonPreview: FreshPreview } = await import('./RouteLoadingSkeleton');
        const { container } = render(<FreshPreview pathname="/login" />);
        expect(container.querySelector('[aria-hidden="true"] > div')).toHaveStyle({ minHeight: 'calc(100svh - 64px)' });
        expect(container.querySelector('h2')).toBeNull();
        await act(async () => release({ AuthRouteSkeleton: () => <h2>로그인</h2> }));
        expect(container.querySelector('h2')).toHaveTextContent('로그인');
        vi.doUnmock('./RouteSkeletonPages');
    });

    it('resolves and removes the page skeleton when the chunk is ready', async () => {
        let resolve;
        const Page = lazy(() => new Promise(yes => { resolve = yes; }));
        render(<MemoryRouter initialEntries={['/store/register']}><Suspense fallback={<RouteLoadingSkeleton />}><Page /></Suspense></MemoryRouter>);
        expect(screen.getByRole('status')).toBeInTheDocument();
        await act(async () => resolve({ default: () => <h1>가게 등록</h1> }));
        expect(screen.getByRole('heading', { name: '가게 등록' })).toBeInTheDocument();
        expect(screen.queryByRole('status')).toBeNull();
    });
});
