import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LikedContentItem from './LikedContentItem';
import PostInteractionBar from './PostInteractionBar';
import LikedContentList from './LikedContentList';
import MyFavorites from '../../pages/favorite/MyFavorites';
import service from '../../services/feedInteractionService';
import favoriteService from '../../services/favoriteService';

vi.mock('../../services/feedInteractionService', () => ({ default: { mine: vi.fn(), status: vi.fn(), setLike: vi.fn() } }));
vi.mock('../../services/favoriteService', () => ({ default: { getMyFavorites: vi.fn() } }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../hooks/useFeedActions', () => ({ default: () => ({ onShare: vi.fn() }) }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { error: vi.fn() } }) }));
vi.mock('../../hooks/feedInteractionQueries', () => ({
    useFeedInteractions: () => ({ data: { enabled: true, newsEnabled: true } }),
    interactionKeys: { mine: params => ['likes', params], status: (type, id) => ['status', type, id] },
    invalidateInteractions: vi.fn(),
}));
vi.mock('../../hooks/useContentLike', () => ({ default: () => ({ enabled: true, busy: false, label: '좋아요 취소', click: vi.fn(),
    status: { data: { liked: true, likeCount: 12 } } }) }));
vi.mock('./FeedReportModal', () => ({ default: ({ postId, newsId, commentId, onClose }) => postId || newsId || commentId
    ? <section role="dialog" aria-label="신고"><output>{newsId ? 'NEWS' : commentId ? 'COMMENT' : 'POST'}:{newsId || commentId || postId}</output><button onClick={onClose}>닫기</button></section> : null }));

const news = { id: 9, type: 'NEWS', targetId: 7, available: true, news: { id: 7, title: '새 메뉴', storeId: 12, storeName: '테스트 가게',
    content: '가게 소식 내용', createdAt: '2026-11-02T07:00:00', images: [{ url: '/api/store-news/media/1', width: 1200, height: 800 }] } };
const post = { id: 10, type: 'POST', targetId: 8, available: true, post: { id: 8, author: { nickname: '테스트 작성자' }, content: '게시물 내용' } };
const clients = [];
function RouteProbe() { const location = useLocation(); return <output aria-label="현재 경로">{location.pathname}</output>; }
function show(content, view = 'cards') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client);
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/my-favorites?view=${view}`]}>{content}<RouteProbe /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear();
    service.mine.mockResolvedValue({ content: [], totalElements: 0 });
    service.status.mockResolvedValue({ liked: true, likeCount: 1, commentCount: 2 });
    favoriteService.getMyFavorites.mockResolvedValue([]);
});
afterEach(() => clients.splice(0).forEach(client => client.clear()));

describe('liked content follows the store card and row presentation', () => {
    it.each(['cards', 'list'])('keeps only the store name below the content and hides counts in %s', view => {
        const { container } = show(<LikedContentItem item={news} view={view} onReport={vi.fn()} />);
        expect(container.querySelector('.reserve-store-list-row-meta')).toHaveTextContent(/^테스트 가게$/);
        expect(container.querySelector('time')).toBeNull();
        expect(screen.queryByText('가게 소식', { exact: true })).toBeNull();
        expect(screen.getByRole('button', { name: '좋아요 취소' })).not.toHaveTextContent(/\d/);
    });

    it('preserves default feed counts while allowing the likes view to hide them', async () => {
        show(<><section aria-label="기본 상호작용"><PostInteractionBar targetId={8} postId={8} /></section>
            <section aria-label="간단한 상호작용"><PostInteractionBar targetId={8} postId={8} showCounts={false} /></section></>);
        const regular = screen.getByRole('region', { name: '기본 상호작용' });
        const compact = screen.getByRole('region', { name: '간단한 상호작용' });
        expect(await within(regular).findByText('2')).toBeInTheDocument();
        expect(within(regular).getByRole('button', { name: '좋아요 취소' })).toHaveTextContent('12');
        expect(within(compact).getByRole('link', { name: '댓글 보기' })).not.toHaveTextContent(/\d/);
        expect(within(compact).getByRole('button', { name: '좋아요 취소' })).not.toHaveTextContent(/\d/);
    });

    it.each(['cards', 'list'])('reveals the full long title on hover and keyboard focus without duplicating the %s navigation stop', async view => {
        vi.useFakeTimers();
        try {
            const title = '이번 주에 새롭게 준비한 메뉴와 예약 혜택을 자세히 안내해요';
            const { container } = show(<LikedContentItem item={{ ...news, news: { ...news.news, title } }} view={view} onReport={vi.fn()} />);
            const link = screen.getByRole('link', { name: `${title} 가게 소식 보기` });
            expect(screen.getAllByRole('link', { name: `${title} 가게 소식 보기` })).toHaveLength(1);
            expect(container.querySelector('.reserve-store-card-hit')).toHaveAttribute('tabindex', '-1');
            fireEvent.mouseEnter(link); await act(async () => { vi.advanceTimersByTime(500); });
            expect(screen.getByRole('tooltip')).toHaveTextContent(title);
            fireEvent.mouseLeave(link); await act(async () => { vi.advanceTimersByTime(500); });
            fireEvent.keyDown(document, { key: 'Tab' }); act(() => link.focus());
            await act(async () => { vi.advanceTimersByTime(500); });
            expect(link).toHaveFocus(); expect(screen.getByRole('tooltip')).toHaveTextContent(title);
            fireEvent.click(link);
            expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/benefits/7');
        } finally { vi.useRealTimers(); }
    });

    it('keeps the original photo ratio and the common card title tools', () => {
        const { container } = show(<LikedContentItem item={news} view="cards" onReport={vi.fn()} />);
        const image = container.querySelector('.reserve-card-image');
        expect(image).toHaveAttribute('width', '1200'); expect(image).toHaveAttribute('height', '800');
        expect(image.style.height).toBe('auto'); expect(image.parentElement.style.aspectRatio).toBe('');
        const titleLine = screen.getByRole('heading', { name: '새 메뉴' }).closest('.reserve-store-card-title-line');
        expect(within(titleLine).getByRole('link', { name: '가게 보기' })).toHaveAttribute('href', '/store/12');
        expect(within(titleLine).getByRole('button', { name: '소식 신고' })).toBeInTheDocument();
        expect(within(titleLine).getByRole('button', { name: '좋아요 취소' })).toBeInTheDocument();
        expect(container.querySelector('.ant-card-actions')).toBeNull();
    });

    it.each(['cards', 'list'])('keeps %s report and store controls outside the content navigation target', view => {
        const report = vi.fn(); const { container } = show(<LikedContentItem item={news} view={view} onReport={report} />);
        const details = screen.getByRole('link', { name: '새 메뉴 가게 소식 보기' });
        const title = view === 'cards' ? screen.getByRole('heading', { name: '새 메뉴' }) : screen.getByText('새 메뉴');
        const titleLine = title.closest('.reserve-liked-title-line');
        const button = within(titleLine).getByRole('button', { name: '소식 신고' });
        expect(details.contains(button)).toBe(false);
        fireEvent.click(button); expect(report).toHaveBeenCalledWith(news);
        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/my-favorites');
        fireEvent.click(within(titleLine).getByRole('link', { name: '가게 보기' }));
        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/store/12');
        expect(container.querySelector('a a, a button')).toBeNull();
    });

    it.each(['cards', 'list'])('retains post comment and share actions with one like control in %s', async view => {
        const share = vi.fn(); show(<LikedContentItem item={post} view={view} onShare={share} onReport={vi.fn()} />);
        expect(screen.getAllByRole('button', { name: '좋아요 취소' })).toHaveLength(1);
        expect(await screen.findByRole('link', { name: '댓글 보기' })).toHaveAttribute('href', '/feed/posts/8#comments');
        fireEvent.click(screen.getByRole('button', { name: '게시물 공유' })); expect(share).toHaveBeenCalledWith(post.post);
    });

    it('opens the existing report form for the selected content type', async () => {
        service.mine.mockResolvedValue({ content: [news], totalElements: 1 });
        show(<LikedContentList type="NEWS" />);
        fireEvent.click(await screen.findByRole('button', { name: '소식 신고' }));
        expect(await screen.findByRole('dialog', { name: '신고' })).toHaveTextContent('NEWS:7');
        fireEvent.click(screen.getByRole('button', { name: '닫기' }));
        await act(async () => {});
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it.each(['cards', 'list'])('keeps 3D illustrations in both empty sections in %s', async view => {
        const { container } = show(<MyFavorites />, view);
        await screen.findByText('아직 즐겨찾기한 가게가 없어요.');
        await screen.findByText('좋아요한 내용이 없어요.');
        expect(container.querySelectorAll('.reserve-data-state:not(.reserve-data-state--compact) img[src*="empty-favorite-512.webp"]')).toHaveLength(2);
    });

    it.each(['POST', 'NEWS', 'COMMENT'])('keeps the likes illustration after changing the filter to %s', async type => {
        const { container } = show(<LikedContentList type={type} />);
        await screen.findByText(type === 'POST' ? '좋아요한 게시물이 없어요.' : type === 'NEWS' ? '좋아요한 가게 소식이 없어요.' : '좋아요한 댓글이 없어요.');
        expect(container.querySelector('.reserve-data-state img')).toHaveAttribute('src', expect.stringContaining('empty-favorite-512.webp'));
    });
});
