import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StoreList from './StoreList';
import storeService from '../../services/storeService';
import adService from '../../services/adService';

const { viewport } = vi.hoisted(() => ({ viewport: { width: 390 } }));

vi.mock('../../services/storeService', () => ({ default: { getStores: vi.fn(), getRegions: vi.fn() } }));
vi.mock('../../services/adService', () => ({ default: { getActiveAds: vi.fn(), recordImpression: vi.fn() } }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../store/useAuthStore', () => ({ default: () => ({ user: null }) }));
vi.mock('../../store/useLocationStore', () => ({ default: () => ({ liveLocation: null, setLiveLocation: vi.fn() }) }));
vi.mock('../../hooks', async () => ({
    useStoreList: (await import('../../hooks/useStoreList')).default,
    useGeolocation: () => ({ request: vi.fn(), requesting: false }),
    useMessage: () => ({ message: { error: vi.fn() } }),
    useWindowWidth: () => viewport.width,
}));
vi.mock('../../components/common', () => ({
    PageContainer: ({ children, className }) => <main className={className}>{children}</main>,
    StoreCardSkeleton: ({ count }) => <div data-testid="card-skeleton">{count}</div>,
    FilterMenu: ({ value, onChange, 'aria-label': label, options, disabled }) => <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>,
    Button: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>,
    DataState: ({ state = 'empty', title, subject, onRetry }) => (
        <section role={state === 'error' ? 'alert' : undefined}>
            <span>{title ?? `${subject ?? '목록'}을 불러오지 못했습니다.`}</span>
            {onRetry && <button type="button" onClick={onRetry}>다시 불러오기</button>}
        </section>
    ),
}));
vi.mock('../../components/store', () => ({ StoreCard: ({ store }) => <div data-testid="original-card">{store.name}</div> }));
vi.mock('../../components/store/StoreListRow', () => ({ default: ({ store }) => <article data-testid="list-row">{store.name}</article> }));
vi.mock('../../components/advertisement/AdBanner', () => ({ default: () => null }));
vi.mock('antd', () => ({
    Modal: () => null,
    Typography: { Text: ({ children }) => <span>{children}</span> },
    Empty: ({ description, children }) => <div>{description}{children}</div>,
    Pagination: ({ current, onChange, disabled }) => <>
        <button type="button" disabled={disabled} onClick={() => onChange(current - 1)}>이전 페이지</button>
        <button type="button" disabled={disabled} onClick={() => onChange(current + 1)}>다음 페이지</button>
    </>,
}));

function RouteProbe() {
    const location = useLocation();
    const navigate = useNavigate();
    return <><output data-testid="route">{location.search}</output><button type="button" onClick={() => navigate(-1)}>이전 보기</button></>;
}

const renderList = (url = '/stores') => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[url]}><StoreList /><RouteProbe /></MemoryRouter>
    </QueryClientProvider>,
);
const routeParams = () => new URLSearchParams(screen.getByTestId('route').textContent);

describe('store list view selection with real URL pagination', () => {
    beforeEach(() => {
        sessionStorage.clear();
        viewport.width = 390;
        storeService.getStores.mockReset();
        adService.getActiveAds.mockReset().mockResolvedValue([]);
        adService.recordImpression.mockReset();
        storeService.getStores.mockImplementation(async ({ page }) => ({
            content: [{ id: page + 1, name: `페이지 ${page + 1} 가게` }],
            page: { totalElements: 36, totalPages: 3 },
        }));
        vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    });

    it('writes both card and list modes explicitly without refetching or resetting filters/page', async () => {
        const user = userEvent.setup();
        renderList('/stores?keyword=카페&domain=FOOD&sort=reviewCount&page=3&utm_source=yes');
        await screen.findByTestId('original-card');
        expect(routeParams().get('view')).toBe('cards');
        const toggle = screen.getByRole('button', { name: '목록형 보기로 전환' });
        expect(toggle.parentElement?.firstElementChild).toBe(toggle);
        expect(toggle.parentElement?.lastElementChild).toHaveClass('reserve-explore-filter-controls');
        expect(toggle.querySelector('[data-icon="unordered-list"]')).toBeInTheDocument();
        await user.click(toggle);
        expect(screen.getByTestId('list-row')).toHaveTextContent('페이지 3 가게');
        expect(screen.queryByTestId('original-card')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' }).querySelector('[data-icon="appstore"]')).toBeInTheDocument();
        expect(Object.fromEntries(routeParams())).toEqual({ keyword: '카페', domain: 'FOOD', sort: 'reviewCount', page: '3', utm_source: 'yes', view: 'list' });
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
        expect(storeService.getStores).toHaveBeenLastCalledWith({ keyword: '카페', domain: 'FOOD', sort: 'reviewCount', page: 2, size: 12 });
        await user.click(screen.getByRole('button', { name: '사진형 보기로 전환' }));
        expect(screen.getByTestId('original-card')).toBeInTheDocument();
        expect(routeParams().get('view')).toBe('cards');
        expect(routeParams().get('page')).toBe('3');
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
    });

    it('loads a shared list URL, preserves view through filter/page changes, and follows browser history', async () => {
        const user = userEvent.setup();
        renderList('/stores?view=list&page=2&keyword=검색&utm_source=yes');
        await screen.findByTestId('list-row');
        await user.selectOptions(screen.getByLabelText('가게 정렬'), 'reviewCount');
        await waitFor(() => expect(screen.getByTestId('list-row')).toHaveTextContent('페이지 1 가게'));
        expect(routeParams().get('view')).toBe('list');
        expect(routeParams().has('page')).toBe(false);
        await user.click(screen.getByRole('button', { name: '다음 페이지' }));
        await waitFor(() => expect(screen.getByTestId('list-row')).toHaveTextContent('페이지 2 가게'));
        expect(routeParams().get('view')).toBe('list');
        expect(routeParams().get('keyword')).toBe('검색');
        expect(routeParams().get('utm_source')).toBe('yes');
        await user.click(screen.getByRole('button', { name: '사진형 보기로 전환' }));
        await user.click(screen.getByRole('button', { name: '이전 보기' }));
        expect(screen.getByTestId('list-row')).toHaveTextContent('페이지 2 가게');
        expect(routeParams().get('view')).toBe('list');
    });

    it('animates only loaded pagination results in the clicked direction, not view toggles or loading skeletons', async () => {
        const user = userEvent.setup();
        let resolveNext;
        storeService.getStores.mockImplementation(({ page }) => page === 0
            ? Promise.resolve({ content: [{ id: 1, name: '첫 페이지 가게' }], page: { totalElements: 36, totalPages: 3 } })
            : new Promise(done => { resolveNext = done; }));
        const { container } = renderList();
        await screen.findByTestId('original-card');
        await user.click(screen.getByRole('button', { name: '목록형 보기로 전환' }));
        expect(container.querySelector('.reserve-explore-result--page-next')).toBeNull();
        await user.click(screen.getByRole('button', { name: '다음 페이지' }));
        expect(screen.getByRole('status', { name: '가게 목록을 불러오는 중' }).parentElement).not.toHaveClass('reserve-explore-result--page-next');
        expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'smooth' });
        await act(async () => resolveNext({ content: [{ id: 2, name: '두 번째 페이지 가게' }], page: { totalElements: 36, totalPages: 3 } }));
        expect(await screen.findByTestId('list-row')).toHaveTextContent('두 번째 페이지 가게');
        const rows = container.querySelector('.reserve-store-list-rows');
        expect(rows).toHaveClass('reserve-explore-result--page-next');
        fireEvent(rows, new Event('webkitAnimationEnd', { bubbles: true }));
        await waitFor(() => expect(rows).not.toHaveClass('reserve-explore-result--page-next'));
        await user.click(screen.getByRole('button', { name: '이전 페이지' }));
        await waitFor(() => expect(screen.getByTestId('list-row')).toHaveTextContent('첫 페이지 가게'));
        expect(container.querySelector('.reserve-store-list-rows')).toHaveClass('reserve-explore-result--page-previous');
    });

    it('limits home-banner entrance motion to its store destination and clears it after result animation', async () => {
        const { container } = renderList({ pathname: '/stores', search: '?domain=FOOD', state: { reserveDiscoveryEntry: 'featured-banner' } });
        await screen.findByTestId('original-card');
        expect(container.querySelector('.reserve-explore-page')).toHaveClass('reserve-explore-page--banner-entry');
        const results = container.querySelector('.rsv-store-grid');
        expect(results).toHaveClass('reserve-explore-result--banner-entry');
        fireEvent(results, new Event('webkitAnimationEnd', { bubbles: true }));
        await waitFor(() => expect(container.querySelector('.reserve-explore-page')).not.toHaveClass('reserve-explore-page--banner-entry'));
    });

    it.each([
        ['/stores?view=cards', 'card-skeleton'],
        ['/stores?view=list', 'list-skeleton'],
    ])('locks the view control during the selected %s loading skeleton', async (url, skeleton) => {
        let resolve;
        storeService.getStores.mockReturnValue(new Promise(done => { resolve = done; }));
        const user = userEvent.setup();
        const { container } = renderList(url);
        if (skeleton === 'card-skeleton') expect(screen.getByTestId('card-skeleton')).toHaveTextContent('12');
        else expect(container.querySelectorAll('.reserve-store-list-row-skeleton')).toHaveLength(12);
        const toggle = screen.getByRole('button', { name: skeleton === 'card-skeleton' ? '목록형 보기로 전환' : '사진형 보기로 전환' });
        expect(toggle).toBeDisabled();
        await user.click(toggle);
        expect(screen.getByRole('status', { name: '가게 목록을 불러오는 중' })).toHaveAttribute('aria-busy', 'true');
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
        await act(async () => resolve({ content: [{ id: 1, name: '정상 가게' }], page: { totalElements: 1, totalPages: 1 } }));
        if (skeleton === 'card-skeleton') expect(await screen.findByTestId('original-card')).toHaveTextContent('정상 가게');
        else expect(await screen.findByTestId('list-row')).toHaveTextContent('정상 가게');
    });

    it('normalizes an unknown view to explicit cards without discarding other URL values', async () => {
        renderList('/stores?view=unknown&page=2&utm_source=yes');
        expect(await screen.findByTestId('original-card')).toHaveTextContent('페이지 2 가게');
        expect(routeParams().get('view')).toBe('cards');
        expect(routeParams().get('utm_source')).toBe('yes');
    });

    it('retains errors and explicit retry after changing the view instead of presenting an empty list', async () => {
        storeService.getStores.mockRejectedValueOnce(new Error('실제 조회 실패'));
        const user = userEvent.setup();
        renderList();
        await screen.findByRole('alert');
        expect(screen.getByRole('alert')).toHaveTextContent('가게 목록을 불러오지 못했습니다.');
        await user.click(screen.getByRole('button', { name: '목록형 보기로 전환' }));
        expect(screen.getByRole('alert')).toHaveTextContent('가게 목록을 불러오지 못했습니다.');
        expect(screen.queryByText('조건에 맞는 가게가 없습니다.')).not.toBeInTheDocument();
        storeService.getStores.mockResolvedValue({ content: [{ id: 1, name: '복구 가게' }], page: { totalElements: 1, totalPages: 1 } });
        await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByTestId('list-row')).toHaveTextContent('복구 가게');
    });

    it('does not record the same advertised result again solely because its card/row view changes', async () => {
        adService.getActiveAds.mockImplementation(async type => type === 'BADGE' ? [{ storeId: 1, id: 42 }] : []);
        const user = userEvent.setup();
        renderList();
        await screen.findByTestId('original-card');
        await waitFor(() => expect(adService.recordImpression).toHaveBeenCalledExactlyOnceWith(42));
        await user.click(screen.getByRole('button', { name: '목록형 보기로 전환' }));
        await user.click(screen.getByRole('button', { name: '사진형 보기로 전환' }));
        expect(adService.recordImpression).toHaveBeenCalledTimes(1);
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
    });

    it.each([2, 3, 4])('keeps %i desktop cards as ordinary fixed-grid items without resizing the row', async count => {
        viewport.width = 1280;
        storeService.getStores.mockResolvedValue({
            content: Array.from({ length: count }, (_, index) => ({
                id: index + 1,
                name: `${index + 1}번 가게`,
                mainImageWidth: index % 2 === 0 ? 1600 : 1000,
                mainImageHeight: index % 2 === 0 ? 900 : 1000,
            })),
            page: { totalElements: count, totalPages: 1 },
        });

        const { container } = renderList();
        await screen.findAllByTestId('original-card');
        const grid = container.querySelector('.rsv-store-grid');
        expect(grid).toBeInTheDocument();
        expect(grid.children).toHaveLength(count);
        expect(container.querySelector('.reserve-store-card-row')).toBeNull();
        expect(container.querySelector('[style*="--reserve-store-card"]')).toBeNull();
    });
});
