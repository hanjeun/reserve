import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StoreList from './StoreList';
import storeService from '../../services/storeService';
import adService from '../../services/adService';
import { createLoadingPresentation, LoadingPresentationContext } from '../../components/layout/loadingPresentation';

const { viewport, locationState, locationRequest, setLiveLocation, messageInfo } = vi.hoisted(() => ({
    viewport: { width: 390 },
    locationState: { user: null },
    locationRequest: vi.fn(),
    setLiveLocation: vi.fn(),
    messageInfo: vi.fn(),
}));

vi.mock('../../services/storeService', () => ({ default: { getStores: vi.fn(), getRegions: vi.fn() } }));
vi.mock('../../services/adService', () => ({ default: { getActiveAds: vi.fn(), recordImpression: vi.fn() } }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../store/useAuthStore', () => ({ default: () => ({ user: locationState.user }) }));
vi.mock('../../store/useLocationStore', () => ({ default: () => ({ liveLocation: null, setLiveLocation }) }));
vi.mock('../../hooks', async () => ({
    useStoreList: (await import('../../hooks/useStoreList')).default,
    useGeolocation: () => ({ request: locationRequest, requesting: false }),
    useMessage: () => ({ message: { error: vi.fn(), info: messageInfo } }),
    useWindowWidth: () => viewport.width,
}));
vi.mock('../../components/common/FilterMenu', () => ({
    default: ({ value, onChange, 'aria-label': label, options, disabled }) => <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>,
}));
vi.mock('../../components/common', () => ({
    PageContainer: ({ children, className }) => <main className={className}>{children}</main>,
    StoreCardSkeleton: ({ count }) => <div data-testid="card-skeleton">{count}</div>,
    Button: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>,
    FilterToolbar: ({ search, onReload, initialLoading }) => initialLoading ? <div data-testid="search-skeleton" aria-hidden="true" /> : <div>
        <input placeholder={search.placeholder} value={search.value} onChange={search.onChange} />
        <button type="button" onClick={onReload}>새로고침</button>
    </div>,
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
vi.mock('antd', async (importOriginal) => ({
    Tooltip: (await importOriginal()).Tooltip,
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

const renderList = (url = '/stores', presentation = null) => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <LoadingPresentationContext.Provider value={presentation}>
        <MemoryRouter initialEntries={[url]}><StoreList /><RouteProbe /></MemoryRouter>
        </LoadingPresentationContext.Provider>
    </QueryClientProvider>,
);
const routeParams = () => new URLSearchParams(screen.getByTestId('route').textContent);

describe('store list view selection with real URL pagination', () => {
    beforeEach(() => {
        sessionStorage.clear();
        viewport.width = 390;
        locationState.user = null;
        locationRequest.mockReset().mockResolvedValue(null);
        setLiveLocation.mockReset();
        messageInfo.mockReset();
        storeService.getStores.mockReset();
        adService.getActiveAds.mockReset().mockResolvedValue([]);
        adService.recordImpression.mockReset();
        storeService.getStores.mockImplementation(async ({ page }) => ({
            content: [{ id: page + 1, name: `페이지 ${page + 1} 가게` }],
            page: { totalElements: 36, totalPages: 3 },
        }));
        vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    });

    it('uses a clicked live position for distance sort while preserving the selected domain', async () => {
        const user = userEvent.setup();
        const coordinates = { latitude: 12.345678, longitude: 67.891234 };
        locationRequest.mockResolvedValue(coordinates);
        renderList('/stores?domain=FOOD&sort=recommended&page=2');
        await screen.findByTestId('original-card');
        expect(locationRequest).not.toHaveBeenCalled();

        await user.selectOptions(screen.getByRole('combobox', { name: '가게 정렬' }), 'distance');

        await waitFor(() => expect(routeParams().get('sort')).toBe('distance'));
        expect(locationRequest).toHaveBeenCalledWith({ showError: true });
        expect(routeParams().get('lat')).toBe('12.346');
        expect(routeParams().get('lng')).toBe('67.891');
        expect(routeParams().get('domain')).toBe('FOOD');
        expect(routeParams().get('page')).toBe('1');
        expect(setLiveLocation).toHaveBeenCalledWith(coordinates);
        expect(messageInfo).not.toHaveBeenCalled();
    });

    it('silences the live failure only when a valid saved address can supply distance sort', async () => {
        const user = userEvent.setup();
        locationState.user = { latitude: 23.456789, longitude: 45.678912 };
        renderList();
        await screen.findByTestId('original-card');

        await user.selectOptions(screen.getByRole('combobox', { name: '가게 정렬' }), 'distance');

        await waitFor(() => expect(routeParams().get('sort')).toBe('distance'));
        expect(locationRequest).toHaveBeenCalledWith({ showError: false });
        expect(messageInfo).toHaveBeenCalledExactlyOnceWith('마이페이지에 등록된 위치 기준으로 정렬할게요.');
        expect(routeParams().get('lat')).toBe('23.457');
        expect(routeParams().get('lng')).toBe('45.679');
        expect(setLiveLocation).not.toHaveBeenCalled();
    });

    it.each([null, { latitude: 120, longitude: 45 }])('keeps the original sort and failure feedback without a usable saved location', async stored => {
        const user = userEvent.setup();
        locationState.user = stored;
        renderList('/stores?sort=recommended');
        await screen.findByTestId('original-card');

        await user.selectOptions(screen.getByRole('combobox', { name: '가게 정렬' }), 'distance');

        expect(locationRequest).toHaveBeenCalledWith({ showError: true });
        await waitFor(() => expect(screen.getByRole('combobox', { name: '가게 정렬' })).toHaveValue('recommended'));
        expect(routeParams().get('sort')).toBe('recommended');
        expect(messageInfo).not.toHaveBeenCalled();
        expect(setLiveLocation).not.toHaveBeenCalled();
    });

    it('writes both views without refetching or resetting filters/page', async () => {
        const user = userEvent.setup();
        renderList('/stores?keyword=카페&domain=FOOD&sort=reviewCount&page=3&utm_source=yes');
        await screen.findByTestId('original-card');
        expect(routeParams().get('view')).toBe('cards');
        const toggle = screen.getByRole('button', { name: '목록형 보기로 전환' });
        expect(toggle.parentElement?.firstElementChild).toBe(toggle);
        expect(toggle.parentElement?.lastElementChild).toHaveClass('reserve-explore-filter-controls');
        expect(toggle.querySelector('.anticon-unordered-list')).toBeInTheDocument();
        await user.click(toggle);
        expect(screen.getByTestId('list-row')).toHaveTextContent('페이지 3 가게');
        expect(screen.queryByTestId('original-card')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' }).querySelector('.anticon-appstore')).toBeInTheDocument();
        expect(Object.fromEntries(routeParams())).toEqual({ keyword: '카페', domain: 'FOOD', sort: 'reviewCount', page: '3', utm_source: 'yes', view: 'list', region: 'all' });
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
        expect(storeService.getStores).toHaveBeenLastCalledWith({ keyword: '카페', domain: 'FOOD', sort: 'reviewCount', page: 2, size: 12 }, expect.any(AbortSignal));
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
        expect(routeParams().get('page')).toBe('1');
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

    it('leaves home-banner entry to the route without starting a second result entrance', async () => {
        const { container } = renderList({ pathname: '/stores', search: '?domain=FOOD', state: { reserveDiscoveryEntry: 'featured-banner' } });
        await screen.findByTestId('original-card');
        expect(container.querySelector('.reserve-explore-page')).not.toHaveClass('reserve-explore-page--banner-entry');
        const results = container.querySelector('.rsv-store-grid');
        expect(results).not.toHaveClass('reserve-explore-result--banner-entry');
    });

    it('does not replay a persisted banner entry after refreshing the store results', async () => {
        const presentation = createLoadingPresentation('restored-results', { documentEntry: true });
        const { container } = renderList({ pathname: '/stores', search: '?domain=FOOD', state: { reserveDiscoveryEntry: 'featured-banner' } }, presentation);
        await screen.findByTestId('original-card');
        expect(container.querySelector('.reserve-explore-page')).not.toHaveClass('reserve-explore-page--banner-entry');
        expect(container.querySelector('.rsv-store-grid')).not.toHaveClass('reserve-explore-result--banner-entry');
    });

    it.each([
        ['/stores?view=cards', 'card-skeleton'],
        ['/stores?view=list', 'list-skeleton'],
    ])('locks the view control during the selected %s loading skeleton', async (url, skeleton) => {
        let resolve;
        storeService.getStores.mockReturnValue(new Promise(done => { resolve = done; }));
        const { container } = renderList(url);
        expect(screen.getByTestId('search-skeleton')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('가게 검색')).toBeNull();
        if (skeleton === 'card-skeleton') expect(screen.getByTestId('card-skeleton')).toHaveTextContent('12');
        else expect(container.querySelectorAll('.reserve-store-list-row-skeleton')).toHaveLength(12);
        const toggleLabel = skeleton === 'card-skeleton' ? '목록형 보기로 전환' : '사진형 보기로 전환';
        expect(screen.queryByRole('button', { name: toggleLabel })).toBeNull();
        expect(container.querySelector('.reserve-explore-filters')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByRole('status', { name: '가게 목록을 불러오는 중' })).toHaveAttribute('aria-busy', 'true');
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
        await act(async () => resolve({ content: [{ id: 1, name: '정상 가게' }], page: { totalElements: 1, totalPages: 1 } }));
        if (skeleton === 'card-skeleton') expect(await screen.findByTestId('original-card')).toHaveTextContent('정상 가게');
        else expect(await screen.findByTestId('list-row')).toHaveTextContent('정상 가게');
        expect(screen.getByRole('button', { name: toggleLabel })).toBeEnabled();
        expect(screen.queryByTestId('search-skeleton')).toBeNull();
        expect(screen.getByPlaceholderText('가게 검색')).toBeEnabled();
    });

    it('normalizes an unknown view to explicit cards without discarding other URL values', async () => {
        renderList('/stores?view=unknown&page=2&utm_source=yes');
        expect(await screen.findByTestId('original-card')).toHaveTextContent('페이지 2 가게');
        expect(routeParams().get('view')).toBe('cards');
        expect(routeParams().get('utm_source')).toBe('yes');
    });

    it('searches after typing settles, keeps the input mounted, and preserves the other URL selections', async () => {
        renderList('/stores?view=list&page=3&domain=FOOD&sort=reviewCount&utm_source=yes');
        await screen.findByTestId('list-row');
        const input = screen.getByPlaceholderText('가게 검색');
        input.focus();
        fireEvent.change(input, { target: { value: '카' } });
        fireEvent.change(input, { target: { value: '카페' } });
        expect(input).toHaveValue('카페');
        expect(storeService.getStores).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(storeService.getStores).toHaveBeenLastCalledWith({
            keyword: '카페', domain: 'FOOD', sort: 'reviewCount', page: 0, size: 12,
        }, expect.any(AbortSignal)));
        expect(storeService.getStores).toHaveBeenCalledTimes(2);
        expect(screen.getByPlaceholderText('가게 검색')).toBe(input);
        expect(input).toHaveFocus();
        expect(routeParams().get('page')).toBe('1');
        expect(routeParams().get('view')).toBe('list');
        expect(routeParams().get('utm_source')).toBe('yes');
    });

    it('retains errors and explicit retry after changing the view instead of presenting an empty list', async () => {
        storeService.getStores.mockRejectedValueOnce(new Error('실제 조회 실패'));
        const user = userEvent.setup();
        renderList();
        await screen.findByRole('alert');
        expect(screen.getByRole('alert')).toHaveTextContent('가게 목록을 불러오지 못했습니다.');
        expect(screen.getByText('목록 확인 필요')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '목록형 보기로 전환' }));
        expect(screen.getByRole('alert')).toHaveTextContent('가게 목록을 불러오지 못했습니다.');
        expect(screen.queryByText('조건에 맞는 가게가 없어요.')).not.toBeInTheDocument();
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
