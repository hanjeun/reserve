import { Suspense, lazy } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RouteLoadingSkeleton, { RouteSkeletonPreview } from './RouteLoadingSkeleton';
import { getRouteSkeletonKind } from './routeSkeletonKind';

const routes = {
    '/': 'discovery', '/search': 'search', '/benefits': 'benefits', '/benefits/1': 'document', '/waiting': 'document', '/feed': 'document',
    '/login': 'form', '/signup': 'form', '/forgot-password': 'form', '/oauth2/callback': 'document', '/signup/social': 'form',
    '/stores': 'store-list', '/store/12': 'detail', '/terms': 'document', '/privacy': 'document', '/operation-guide': 'document',
    '/my-stores': 'cards', '/store/register': 'store-form', '/store/12/edit': 'store-form', '/business': 'workspace', '/admin': 'workspace',
    '/my-reservations': 'reservations', '/my-favorites': 'cards', '/payment/result': 'document', '/my-page': 'my-page', '/messages': 'workspace',
};

describe('route chunk loading patterns', () => {
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
