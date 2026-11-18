import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Header from '../../components/layout/Header';
import WorkspaceMenuProvider from '../../components/layout/WorkspaceMenuProvider';
import feedService from '../../services/feedService';
import storeNewsService from '../../services/storeNewsService';
import useAuthStore from '../../store/useAuthStore';
import { listStoreDrafts } from '../../utils/storeDraftStorage';
import { listMailDrafts } from '../../utils/mailDraftStorage';
import Drafts from './Drafts';

const viewport = vi.hoisted(() => ({ width: 1280 }));
vi.mock('../../hooks/useWindowWidth', () => ({ default: () => viewport.width, useWindowWidth: () => viewport.width }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => true }));
vi.mock('../../components/layout/HeaderAccountMenu', () => ({ default: () => null }));
vi.mock('../../services/feedService', () => ({ default: { config: vi.fn(), myPosts: vi.fn() } }));
vi.mock('../../services/storeNewsService', () => ({ default: { config: vi.fn(), mine: vi.fn() } }));
vi.mock('../../utils/storeDraftStorage', () => ({ listStoreDrafts: vi.fn(), STORE_DRAFT_TTL_DAYS: 30 }));
vi.mock('../../utils/mailDraftStorage', () => ({ listMailDrafts: vi.fn() }));
vi.mock('../../components/feed/FeedEditor', () => ({ default: ({ open, post }) => open ? <p>피드 작성기 {post.id}</p> : null }));
vi.mock('../../components/store-news/StoreNewsEditor', () => ({ default: ({ open, newsId }) => open ? <p>가게 소식 작성기 {newsId}</p> : null }));

const savedAt = '2026-11-10T12:00:00Z';
const previousAuth = useAuthStore.getState();
const clients = [];

function DraftResumeProbe() {
    const { pathname, state } = useLocation();
    return <output data-testid="draft-destination">{JSON.stringify({ pathname, draft: state?.storeDraftResume, mail: state?.mailDraftResume })}</output>;
}

function show(role, url = '/drafts', withHeader = false) {
    useAuthStore.setState({ user: { id: 7, role }, isLoggedIn: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>
        <WorkspaceMenuProvider>{withHeader && <Header />}<Routes>
            <Route path="/drafts" element={<Drafts />} />
            <Route path="/admin" element={<DraftResumeProbe />} />
            <Route path="/store/:id/edit" element={<DraftResumeProbe />} />
        </Routes></WorkspaceMenuProvider>
    </MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
    viewport.width = 1280;
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    feedService.config.mockResolvedValue({ enabled: true });
    feedService.myPosts.mockResolvedValue({ totalElements: 4, content: [1, 2, 3, 4].map(id => ({
        id, content: `피드 초안 ${id}`, state: 'DRAFT', updatedAt: savedAt,
    })).concat({ id: 5, content: '공개 게시글', state: 'PUBLISHED' }) });
    storeNewsService.config.mockResolvedValue({ enabled: true });
    storeNewsService.mine.mockResolvedValue({ totalElements: 1, content: [{
        id: 9, title: '가게 소식 초안', storeName: '확인용 가게', state: 'DRAFT', updatedAt: savedAt,
    }] });
    listStoreDrafts.mockResolvedValue([{ key: 'member:7:store:create:new', name: '가게 등록 초안', savedAt: Date.parse(savedAt) }]);
});

afterEach(() => {
    clients.splice(0).forEach(client => client.clear());
    useAuthStore.setState(previousAuth);
    vi.restoreAllMocks();
});

it('uses member drafts even when a regular member opens an owner tab address', async () => {
    show('USER', '/drafts?tab=news');
    const navigation = screen.getByRole('navigation', { name: '임시보관함 메뉴' });
    expect(within(navigation).getByRole('link', { name: '피드 게시글' })).toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: '가게 소식·혜택' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '임시보관함', level: 1 })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '피드 초안 1 이어서 작성' }));
    expect(screen.getByText('피드 작성기 1')).toBeInTheDocument();
    expect(screen.queryByText('공개 게시글')).not.toBeInTheDocument();
    expect(listStoreDrafts).not.toHaveBeenCalled();
    expect(listMailDrafts).not.toHaveBeenCalled();
    expect(storeNewsService.config).not.toHaveBeenCalled();
});

it('passes the admin mail selection to the mailbox without adding it to the URL', async () => {
    listMailDrafts.mockResolvedValueOnce([{ id: 'fixture-mail', subject: '임시 발송', toEmail: 'guest@example.test', savedAt: Date.parse(savedAt) }]);
    show('ADMIN', '/drafts?tab=mail');
    const link = await screen.findByRole('link', { name: '임시 발송 이어서 작성' });
    expect(link).toHaveAttribute('href', '/admin?tab=mailbox&mailFolder=sent');
    fireEvent.click(link);
    expect(JSON.parse(screen.getByTestId('draft-destination').textContent)).toEqual({ pathname: '/admin', mail: 'fixture-mail' });
    expect(listMailDrafts).toHaveBeenCalledExactlyOnceWith(7);
});

it('shows bounded previews and reuses the first draft page when a category opens', async () => {
    show('BUSINESS');
    expect(await screen.findByText('가게 등록 초안')).toBeInTheDocument();
    expect(await screen.findByText('가게 소식 초안')).toBeInTheDocument();
    expect(await screen.findByText('피드 초안 3')).toBeInTheDocument();
    expect(screen.queryByText('피드 초안 4')).not.toBeInTheDocument();
    expect(listStoreDrafts).toHaveBeenCalledWith(7);
    expect(feedService.myPosts).toHaveBeenCalledWith({ page: 0, size: 12, drafts: true }, expect.anything());
    expect(storeNewsService.mine).toHaveBeenCalledWith({ page: 0, size: 12, state: 'DRAFT' }, expect.anything());

    fireEvent.click(screen.getByRole('link', { name: '피드 게시글 모두 보기' }));
    expect(await screen.findByText('피드 초안 4')).toBeInTheDocument();
    expect(feedService.myPosts).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole('navigation', { name: '임시보관함 메뉴' })).getByRole('link', { name: '가게 소식·혜택' }));
    fireEvent.click(await screen.findByRole('button', { name: '가게 소식 초안 이어서 작성' }));
    expect(screen.getByText('가게 소식 작성기 9')).toBeInTheDocument();
});

it('opens and closes the same header drawer on mobile while preserving the selected category', async () => {
    viewport.width = 390;
    show('BUSINESS', '/drafts?tab=news', true);
    expect(await screen.findByText('가게 소식 초안')).toBeInTheDocument();
    expect(feedService.config).not.toHaveBeenCalled();
    expect(listStoreDrafts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '임시보관함 메뉴 열기' }));
    const drawer = await screen.findByRole('dialog', { name: '임시보관함 메뉴' });
    expect(within(drawer).getByRole('link', { name: '가게 소식·혜택' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(drawer).getByRole('button', { name: '메뉴 닫기' }));
    expect(screen.getByRole('heading', { name: '가게 소식·혜택', level: 1 })).toBeInTheDocument();
});

it('passes the saved store selection to the existing edit route', async () => {
    const selection = { key: 'member:7:store:edit:12', savedAt: Date.parse(savedAt) };
    listStoreDrafts.mockResolvedValueOnce([{ ...selection, storeId: '12', name: '수정 중인 가게' }]);
    show('BUSINESS', '/drafts?tab=stores');
    fireEvent.click(await screen.findByRole('link', { name: '수정 중인 가게 이어서 작성' }));
    expect(JSON.parse(screen.getByTestId('draft-destination').textContent)).toEqual({ pathname: '/store/12/edit', draft: selection });
});
