import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyFavorites from './MyFavorites';
import favoriteService from '../../services/favoriteService';

vi.mock('../../services/favoriteService', () => ({ default: { getMyFavorites: vi.fn() } }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../hooks/feedInteractionQueries', () => ({ useFeedInteractions: () => ({ data: { enabled: false, newsEnabled: false } }) }));
vi.mock('../../components/common', () => ({
    PageContainer: ({ children, 'aria-busy': busy }) => <main aria-busy={busy}>{children}</main>,
    StoreCardSkeleton: ({ count }) => <div data-testid="card-skeleton">{count}</div>,
    FilterToolbar: ({ extra, onReload, loading }) => <div>{extra}<button type="button" onClick={onReload} disabled={loading}>새로고침</button></div>,
    DataState: ({ state, title, subject, onRetry, compact }) => <section role={state === 'error' ? 'alert' : undefined} data-compact={Boolean(compact)}>
        {title ?? `${subject}을 불러오지 못했습니다.`}{onRetry && <button type="button" onClick={onRetry}>다시 불러오기</button>}
    </section>,
}));
vi.mock('../../components/store', () => ({
    StoreCard: ({ store }) => <article data-testid="card" data-store={JSON.stringify(store)}>{store.name}</article>,
}));
vi.mock('../../components/store/StoreListRow', () => ({
    default: ({ store }) => <article data-testid="list-row" data-store={JSON.stringify(store)}>{store.name}</article>,
}));
vi.mock('../../components/store/StoreListRowSkeleton', () => ({
    default: ({ count }) => <div data-testid="list-skeleton">{count}</div>,
}));

const favorite = { id: 51, storeId: 81, storeName: '관심 가게', storeCategory: '카페', storeMainImageUrl: 'https://example.test/store.png', storeRating: 4.5, storeReviewCount: 12 };
const clients = [];

function RouteProbe() {
    const location = useLocation();
    const navigate = useNavigate();
    return <><output data-testid="route">{location.search}</output><button type="button" onClick={() => navigate(-1)}>이전 보기</button></>;
}

function show(url = '/my-favorites') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>
        <MyFavorites /><RouteProbe />
    </MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
    sessionStorage.clear();
    favoriteService.getMyFavorites.mockReset().mockResolvedValue([favorite]);
});
afterEach(() => { clients.splice(0).forEach(client => client.clear()); });

describe('favorites reuse the store card/list view contract', () => {
    it('switches with the keyboard without refetching or losing URL fields and follows history', async () => {
        const user = userEvent.setup();
        show('/my-favorites?utm_source=yes&page=3');
        const card = await screen.findByTestId('card');
        const originalStore = card.getAttribute('data-store');
        const toggle = screen.getByRole('button', { name: '목록형 보기로 전환' });
        expect(toggle.querySelector('.anticon-unordered-list')).toBeInTheDocument();
        toggle.focus();
        await user.keyboard('{Enter}');
        expect(screen.getByTestId('list-row')).toHaveAttribute('data-store', originalStore);
        expect(screen.queryByTestId('card')).toBeNull();
        expect(Object.fromEntries(new URLSearchParams(screen.getByTestId('route').textContent))).toEqual({ utm_source: 'yes', view: 'list', kind: 'all' });
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' })).toHaveFocus();
        await user.keyboard(' ');
        expect(screen.getByTestId('card')).toHaveTextContent(favorite.storeName);
        await user.click(screen.getByRole('button', { name: '이전 보기' }));
        expect(screen.getByTestId('list-row')).toBeInTheDocument();
        expect(favoriteService.getMyFavorites).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('reserve:view-mode:/my-favorites')).toBe('list');
    });

    it.each([
        ['?view=list', 'list-row'], ['?view=cards', 'card'], ['?view=unknown', 'card'],
    ])('lets an explicit URL %s override a saved list view', async (search, testId) => {
        sessionStorage.setItem('reserve:view-mode:/my-favorites', 'list');
        show(`/my-favorites${search}`);
        await screen.findByTestId(testId);
        expect(favoriteService.getMyFavorites).toHaveBeenCalledTimes(1);
    });

    it('restores the favorites view separately from other store list pages', async () => {
        sessionStorage.setItem('reserve:view-mode:/my-favorites', 'list');
        sessionStorage.setItem('reserve:view-mode:/stores', 'cards');
        show();
        await screen.findByTestId('list-row');
        expect(new URLSearchParams(screen.getByTestId('route').textContent).get('view')).toBe('list');
        expect(sessionStorage.getItem('reserve:view-mode:/stores')).toBe('cards');
    });

    it('uses list-shaped initial placeholders and preserves rows and the view toggle during refresh', async () => {
        let finishInitial;
        let finishRefresh;
        favoriteService.getMyFavorites
            .mockImplementationOnce(() => new Promise(resolve => { finishInitial = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
        show('/my-favorites?view=list');
        expect(screen.getByTestId('list-skeleton')).toHaveTextContent('8');
        expect(screen.queryByTestId('card-skeleton')).toBeNull();
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' })).toBeDisabled();
        await waitFor(() => expect(finishInitial).toBeTypeOf('function'));
        await act(async () => finishInitial([favorite]));
        const cachedRow = await screen.findByTestId('list-row');
        fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
        await waitFor(() => expect(finishRefresh).toBeTypeOf('function'));
        expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByRole('status', { name: '즐겨찾기를 새로 불러오는 중' })).toBeNull();
        expect(screen.queryByTestId('list-skeleton')).toBeNull();
        expect(screen.getByTestId('list-row')).toBe(cachedRow);
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' })).toBeEnabled();
        expect(screen.getByRole('button', { name: '새로고침' })).toBeDisabled();
        await act(async () => finishRefresh([{ ...favorite, storeName: '새로고침 후 관심 가게' }]));
        expect(await screen.findByText('새로고침 후 관심 가게')).toBe(screen.getByTestId('list-row'));
        expect(screen.queryByText(favorite.storeName)).toBeNull();
        await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'));
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' })).toBeEnabled();
    });

    it('retains the selected layout and stale rows when a refresh fails', async () => {
        favoriteService.getMyFavorites.mockResolvedValueOnce([favorite])
            .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
        show('/my-favorites?view=list');
        const row = await screen.findByTestId('list-row');
        const params = screen.getByTestId('route').textContent;
        fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
        expect(await screen.findByRole('alert')).toHaveAttribute('data-compact', 'true');
        expect(screen.getByTestId('list-row')).toBe(row);
        expect(row).toHaveTextContent(favorite.storeName);
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' })).toBeEnabled();
        expect(screen.queryByTestId('card')).toBeNull();
        expect(screen.getByTestId('route')).toHaveTextContent(params);
    });

    it('replaces a cached empty favorites result with a full error after 503 and preserves the selected view', async () => {
        favoriteService.getMyFavorites.mockResolvedValueOnce([])
            .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
        show('/my-favorites?view=list&kind=stores&utm_source=kept');
        await screen.findByText('아직 즐겨찾기한 가게가 없어요.');
        const toggle = screen.getByRole('button', { name: '사진형 보기로 전환' });
        const params = screen.getByTestId('route').textContent;
        fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
        expect(await screen.findByRole('alert')).toHaveAttribute('data-compact', 'false');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.queryByText('아직 즐겨찾기한 가게가 없어요.')).toBeNull();
        expect(screen.queryByTestId('card')).toBeNull();
        expect(screen.queryByTestId('list-row')).toBeNull();
        expect(screen.queryByTestId('list-skeleton')).toBeNull();
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' })).toBe(toggle);
        expect(toggle).toBeEnabled();
        expect(screen.getByTestId('route')).toHaveTextContent(params);
        expect(favoriteService.getMyFavorites).toHaveBeenCalledTimes(2);
    });
});
