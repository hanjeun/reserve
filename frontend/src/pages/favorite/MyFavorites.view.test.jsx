import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyFavorites from './MyFavorites';
import favoriteService from '../../services/favoriteService';

vi.mock('../../services/favoriteService', () => ({ default: { getMyFavorites: vi.fn() } }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../components/common', () => ({
    PageContainer: ({ children }) => <main>{children}</main>,
    StoreCardSkeleton: ({ count }) => <div data-testid="card-skeleton">{count}</div>,
    FilterToolbar: ({ extra, onReload, loading }) => <div>{extra}<button type="button" onClick={onReload} disabled={loading}>새로고침</button></div>,
    DataState: ({ state, title, onRetry }) => <section role={state === 'error' ? 'alert' : undefined}>
        {title}{onRetry && <button type="button" onClick={onRetry}>다시 불러오기</button>}
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
        show('/my-favorites?keep=yes&page=3');
        const card = await screen.findByTestId('card');
        const originalStore = card.getAttribute('data-store');
        const toggle = screen.getByRole('button', { name: '목록형 보기로 전환' });
        expect(toggle.querySelector('[data-icon="unordered-list"]')).toBeInTheDocument();
        toggle.focus();
        await user.keyboard('{Enter}');
        expect(screen.getByTestId('list-row')).toHaveAttribute('data-store', originalStore);
        expect(screen.queryByTestId('card')).toBeNull();
        expect(Object.fromEntries(new URLSearchParams(screen.getByTestId('route').textContent))).toEqual({ keep: 'yes', page: '3', view: 'list' });
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

    it('keeps list-shaped loading/refetch placeholders and disables the view toggle until data settles', async () => {
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
        await screen.findByTestId('list-row');
        fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
        await waitFor(() => expect(finishRefresh).toBeTypeOf('function'));
        expect(screen.getByRole('status', { name: '즐겨찾기를 새로 불러오는 중' })).toBeInTheDocument();
        expect(screen.getByTestId('list-skeleton')).toHaveTextContent('1');
        expect(screen.queryByTestId('list-row')).toBeNull();
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' })).toBeDisabled();
        await act(async () => finishRefresh([favorite]));
        await screen.findByTestId('list-row');
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' })).toBeEnabled();
    });

    it('retains the selected layout and stale rows when a refresh fails', async () => {
        favoriteService.getMyFavorites.mockResolvedValueOnce([favorite]).mockRejectedValueOnce(new Error('offline'));
        show('/my-favorites?view=list');
        await screen.findByTestId('list-row');
        fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
        await screen.findByRole('alert');
        expect(screen.getByTestId('list-row')).toHaveTextContent(favorite.storeName);
        expect(screen.getByRole('button', { name: '사진형 보기로 전환' })).toBeEnabled();
        expect(screen.queryByTestId('card')).toBeNull();
    });
});
