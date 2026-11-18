import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ReviewList from './ReviewList';
import reviewService from '../../services/reviewService';
import feedService from '../../services/feedService';
import { reviewKeys } from '../../hooks/queryKeys';

const auth = vi.hoisted(() => ({ user: null, isLoggedIn: false, sessionRevision: 0 }));
const confirm = vi.hoisted(() => vi.fn());

vi.mock('../../hooks', async (importOriginal) => ({
    ...(await importOriginal()),
    useMessage: () => ({ message: { success: vi.fn(), error: vi.fn() }, confirm }),
}));
vi.mock('../../services/reviewService', () => ({ default: {
    getReviewsByStore: vi.fn(), createReview: vi.fn(), updateReview: vi.fn(), deleteReview: vi.fn(),
    setLike: vi.fn(), listComments: vi.fn(), addComment: vi.fn(),
} }));
vi.mock('../../services/feedService', () => ({ default: { myProfile: vi.fn() } }));
vi.mock('../../store/useAuthStore', () => ({
    default: Object.assign(selector => selector ? selector(auth) : auth, {
        getState: () => auth,
        subscribe: () => () => {},
    }),
}));
const renderReviews = (props = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }) => <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
    return { ...render(<ReviewList storeId={12} {...props} />, { wrapper }), client };
};

describe('review read states', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        feedService.myProfile.mockReset().mockResolvedValue(null);
        auth.user = null;
        auth.isLoggedIn = false;
    });

    it('requests the next review page only after a click and keeps the store-wide rating', async () => {
        const cursor = { beforeId: 51, beforeDate: '2026-10-01T12:00:00' };
        reviewService.getReviewsByStore
            .mockResolvedValueOnce({ content: [{ id: 51, title: '최근 리뷰', rating: 5 }], next: cursor })
            .mockResolvedValueOnce({ content: [{ id: 49, title: '이전 리뷰', rating: 1 }], next: null });
        renderReviews({ ratingSummary: { reviewCount: 31, rating: 4.2 } });
        const more = await screen.findByRole('button', { name: '리뷰 더 보기' });
        expect(reviewService.getReviewsByStore).toHaveBeenCalledTimes(1);
        fireEvent.click(more);
        expect(await screen.findByText('이전 리뷰')).toBeInTheDocument();
        expect(screen.getByText('최근 리뷰')).toBeInTheDocument();
        expect(screen.getByText('리뷰 31개')).toBeInTheDocument();
        expect(reviewService.getReviewsByStore).toHaveBeenLastCalledWith(12, expect.any(AbortSignal), { limit: 10, ...cursor });
    });

    it('uses the thumbnail in both lists and requests the original for an opened photo', async () => {
        const url = '/api/reviews/51/photos/31';
        const thumbnailUrl = url + '?size=thumbnail';
        reviewService.getReviewsByStore.mockResolvedValue([{ id: 51, title: '사진 리뷰', rating: 5,
            photos: [{ id: 31, url, thumbnailUrl, width: 500, height: 300 }] }]);
        const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
            .mockReturnValue({ left: 10, right: 110, top: 10, bottom: 70, width: 100, height: 60 });
        try {
            const { container } = renderReviews();
            const overview = await screen.findByRole('region', { name: '리뷰 사진 모아보기' });
            const tile = within(overview).getByRole('button', { name: '리뷰 사진 1 크게 보기' });
            await waitFor(() => expect(container.querySelectorAll('img[src="' + thumbnailUrl + '"]')).toHaveLength(2));
            expect(document.querySelector('img[src="' + url + '"]')).toBeNull();
            fireEvent.click(tile);
            const dialog = await screen.findByRole('dialog');
            const photo = dialog.querySelector('img[src="' + url + '"]');
            expect(photo).toBeInTheDocument();
            expect(within(dialog).getByRole('status', { name: '사진을 불러오는 중' })).toBeInTheDocument();
            fireEvent.load(photo);
            expect(within(dialog).queryByRole('status', { name: '사진을 불러오는 중' })).toBeNull();
        } finally {
            bounds.mockRestore();
        }
    });

    it('uses the visible profile in the review editor and displays server-projected photos for other readers', async () => {
        auth.user = { id: 7, name: '시험 회원', profileImageUrl: 'https://example.com/account.jpg' };
        auth.isLoggedIn = true;
        const expectedPhoto = 'https://example.com/profile.jpg';
        const publicId = '11111111-1111-4111-8111-111111111111';
        feedService.myProfile.mockResolvedValue({ visibility: 'PUBLIC', nickname: '내 프로필 닉네임', avatarUrl: expectedPhoto });
        reviewService.getReviewsByStore.mockResolvedValue([
            { id: 11, mine: true, memberName: '내 프로필 닉네임', authorAvatarUrl: expectedPhoto, authorPublicId: publicId,
                rating: 5, title: '이전 방문 후기' },
            { id: 12, mine: false, memberName: '다른 회원', authorAvatarUrl: 'https://example.com/other.jpg', rating: 4, title: '다른 회원의 리뷰' },
        ]);
        renderReviews({ completedReservation: { reservationId: 91, reviewId: null } });

        const composer = await screen.findByRole('form', { name: '리뷰 작성' });
        await waitFor(() => expect(within(composer).getByRole('img', { name: '프로필' })).toHaveAttribute('src', expectedPhoto));
        const [ownReview, otherReview] = screen.getAllByRole('article');
        expect(within(ownReview).getByRole('img', { name: '프로필' })).toHaveAttribute('src', expectedPhoto);
        expect(within(ownReview).getByRole('link', { name: '내 프로필 닉네임의 프로필' })).toHaveAttribute('href', '/feed/u/' + publicId);
        expect(within(otherReview).getByRole('img', { name: '프로필' })).toHaveAttribute('src', 'https://example.com/other.jpg');

        fireEvent.click(within(ownReview).getByRole('button', { name: '리뷰 메뉴' }));
        fireEvent.click(await screen.findByRole('menuitem', { name: '리뷰 수정' }));
        const editor = screen.getByRole('form', { name: '리뷰 수정' });
        expect(within(editor).getByRole('img', { name: '프로필' })).toHaveAttribute('src', expectedPhoto);
        expect(within(editor).getByText('내 프로필 닉네임')).toBeInTheDocument();
        expect(within(editor).queryByRole('button', { name: '리뷰 표시 이름 변경' })).toBeNull();
    });

    it('keeps an existing anonymous review anonymous even when the writer now has a visible profile', async () => {
        auth.user = { id: 7 };
        auth.isLoggedIn = true;
        const review = { id: 12, mine: true, memberName: '느긋한 거북이', authorAlias: '느긋한 거북이',
            authorPublicId: '11111111-1111-4111-8111-111111111111', authorAvatarUrl: 'https://example.invalid/old.jpg',
            title: '방문 후기', content: '친절하게 설명해주셨어요.', rating: 5 };
        feedService.myProfile.mockResolvedValue({ visibility: 'PUBLIC', nickname: '내 프로필', avatarUrl: 'https://example.invalid/current.jpg' });
        reviewService.getReviewsByStore.mockResolvedValue([review]);
        reviewService.updateReview.mockResolvedValue(review);
        renderReviews();
        const card = await screen.findByRole('article');
        expect(within(card).queryByRole('link')).toBeNull();
        expect(within(card).queryByRole('img', { name: '프로필' })).toBeNull();
        fireEvent.click(within(card).getByRole('button', { name: '리뷰 메뉴' }));
        fireEvent.click(await screen.findByRole('menuitem', { name: '리뷰 수정' }));
        const editor = await screen.findByRole('form', { name: '리뷰 수정' });
        expect(within(editor).getByText('느긋한 거북이')).toBeInTheDocument();
        expect(within(editor).queryByRole('img', { name: '프로필' })).toBeNull();
        expect(within(editor).getByRole('textbox', { name: '리뷰 제목' })).toHaveFocus();
        fireEvent.click(within(editor).getByRole('button', { name: '저장' }));
        await waitFor(() => expect(reviewService.updateReview).toHaveBeenCalledWith(12,
            { title: review.title, content: review.content, rating: 5 }, [], []));
        const updated = await screen.findByRole('article');
        await waitFor(() => expect(within(updated).getByRole('button', { name: '리뷰 메뉴' })).toHaveFocus());
    });

    it('opens the eligible visit directly and keeps the redundant create button out after cancel or consumption', async () => {
        reviewService.getReviewsByStore.mockResolvedValue([]);
        const { rerender } = renderReviews({ completedReservation: { reservationId: 91, reviewId: null } });
        const editor = await screen.findByRole('form', { name: '리뷰 작성' });
        fireEvent.click(within(editor).getByRole('button', { name: '취소' }));
        expect(screen.queryByRole('form', { name: '리뷰 작성' })).toBeNull();
        expect(screen.queryByRole('button', { name: '리뷰 작성', exact: true })).toBeNull();
        rerender(<ReviewList storeId={12} reviewNavigationKey="new-visit"
            completedReservation={{ reservationId: 91, reviewId: null, reviewWritten: true }} />);
        expect(screen.queryByRole('form', { name: '리뷰 작성' })).toBeNull();
    });

    it('removes the review content immediately and collapses only the vacated row', async () => {
        auth.user = { id: 7 };
        auth.isLoggedIn = true;
        reviewService.getReviewsByStore.mockResolvedValue([
            { id: 14, mine: true, rating: 5, title: '지울 리뷰' },
            { id: 15, mine: false, rating: 4, title: '남길 리뷰' },
        ]);
        reviewService.deleteReview.mockResolvedValue(null);
        const { container } = renderReviews();
        const [review, other] = await screen.findAllByRole('article');
        vi.spyOn(review, 'getBoundingClientRect').mockReturnValue({ height: 142 });
        fireEvent.click(within(review).getByRole('button', { name: '리뷰 메뉴' }));
        fireEvent.click(await screen.findByRole('menuitem', { name: '리뷰 삭제' }));
        expect(confirm.mock.lastCall[0].content).toContain('같은 예약에는 리뷰를 다시 쓸 수 없어요.');
        await confirm.mock.lastCall[0].onOk();
        await waitFor(() => expect(screen.queryByText('지울 리뷰')).toBeNull());
        expect(container.querySelector('.reserve-review-removal')).toHaveAttribute('aria-hidden', 'true');
        expect(other).toBeInTheDocument();
        await waitFor(() => expect(container.querySelector('.reserve-review-removal')).toBeNull());
    });
    it('submits a review only for the eligible completed reservation and trims its text', async () => {
        const created = { id: 73, memberName: '시험 회원', rating: 5, title: '방문 후기', content: '편안하고 친절한 서비스였습니다.' };
        reviewService.getReviewsByStore.mockResolvedValue([]);
        reviewService.createReview.mockResolvedValue(created);
        renderReviews({ completedReservation: { reservationId: 91, reviewId: null } });
        const editor = await screen.findByRole('form', { name: '리뷰 작성' });
        expect(within(editor).getByText('리저브 이용자')).toBeInTheDocument();
        fireEvent.change(within(editor).getByPlaceholderText('리뷰 제목을 입력해주세요'), { target: { value: '  방문 후기  ' } });
        fireEvent.change(screen.getByPlaceholderText('서비스, 분위기 등 솔직한 경험을 공유해주세요 (10자 이상)'),
            { target: { value: '  편안하고 친절한 서비스였습니다.  ' } });
        fireEvent.click(screen.getAllByRole('radio')[4]);
        fireEvent.click(screen.getByRole('button', { name: /리뷰 등록$/ }));
        await waitFor(() => expect(reviewService.createReview).toHaveBeenCalledWith({
            reservationId: 91, rating: 5, title: '방문 후기', content: '편안하고 친절한 서비스였습니다.',
        }));
        await waitFor(() => expect(screen.queryByRole('button', { name: /리뷰 등록$/ })).not.toBeInTheDocument());
    });

    it('shows the existing card skeleton during the initial request', () => {
        reviewService.getReviewsByStore.mockImplementation(() => new Promise(() => {}));
        renderReviews();
        expect(screen.getByRole('status', { name: '리뷰를 불러오는 중' })).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByText(/아직 리뷰가 없어요/)).toBeNull();
    });

    it('waits for the selected reservation and scrolls to its composer once', async () => {
        const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        const scroll = vi.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
        reviewService.getReviewsByStore.mockResolvedValue([]);
        const navigation = { autoOpenWrite: true, reviewNavigationKey: 'selected-booking' };
        const { rerender } = renderReviews({ ...navigation, completedReservationRetrying: true });

        try {
            await screen.findByText(/아직 리뷰가 없어요/);
            expect(scroll).not.toHaveBeenCalled();
            const completedReservation = { reservationId: 41, reviewId: null };
            rerender(<ReviewList storeId={12} {...navigation} completedReservation={completedReservation} />);
            const editor = await screen.findByRole('form', { name: '리뷰 작성' });
            await waitFor(() => expect(scroll).toHaveBeenCalledExactlyOnceWith({ behavior: 'smooth', block: 'start' }));
            expect(editor).toHaveFocus();
            expect(scroll.mock.contexts[0]).toBe(editor);
            fireEvent.change(within(editor).getByRole('textbox', { name: '리뷰 제목' }), { target: { value: '예약 후기' } });
            expect(scroll).toHaveBeenCalledTimes(1);
        } finally {
            if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previous);
            else delete HTMLElement.prototype.scrollIntoView;
        }
    });

    it('keeps the upload control in the same row as the selected files and submits them in order', async () => {
        const photo = { id: 19, url: '/api/reviews/73/photos/19', width: 90, height: 150 };
        const created = { id: 73, memberName: '시험 회원', rating: 5, title: '방문 후기',
            content: '편안하고 친절한 서비스였습니다.', photos: [photo] };
        const previous = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
        const revoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(file => `blob:${file.name}`) });
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
        reviewService.getReviewsByStore.mockResolvedValue([]);
        reviewService.createReview.mockImplementation(async () => {
            reviewService.getReviewsByStore.mockResolvedValue([created]);
            return created;
        });
        const { unmount } = renderReviews({ completedReservation: { reservationId: 91, reviewId: null } });

        try {
            const editor = await screen.findByRole('form', { name: '리뷰 작성' });
            const files = ['first.png', 'second.png'].map(name => new File(['photo'], name, { type: 'image/png' }));
            fireEvent.change(editor.querySelector('input[type="file"]'), { target: { files } });
            const row = editor.querySelector('.reserve-review-attachments');
            expect(row).toHaveAttribute('data-discovery-swipe-ignore', 'true');
            const list = row.querySelector('.ant-upload-list-picture-card');
            await waitFor(() => expect(list.querySelectorAll('.ant-upload-list-item-container')).toHaveLength(2));
            Object.defineProperties(list, { scrollWidth: { value: 390 }, clientWidth: { value: 160 }, scrollTo: { value: vi.fn() } });
            const pointer = (type, clientX, buttons) => {
                const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0, buttons });
                return Object.assign(event, { pointerId: 1, pointerType: 'mouse' });
            };
            fireEvent(row, pointer('pointerdown', 140, 1));
            fireEvent(row, pointer('pointermove', 60, 1));
            expect(list).toHaveClass('is-dragging');
            fireEvent(row, pointer('pointerup', 60, 0));
            expect(list.scrollLeft).toBe(80);
            expect(list).not.toHaveClass('is-dragging');
            expect(within(list).getByRole('button', { name: '업로드' })).toBeInTheDocument();
            fireEvent.change(within(editor).getByRole('textbox', { name: '리뷰 제목' }), { target: { value: created.title } });
            fireEvent.change(within(editor).getByRole('textbox', { name: '리뷰 내용' }), { target: { value: created.content } });
            fireEvent.click(within(editor).getAllByRole('radio')[4]);
            fireEvent.click(within(editor).getByRole('button', { name: '리뷰 등록' }));
            await waitFor(() => expect(reviewService.createReview).toHaveBeenCalledWith({
                reservationId: 91, rating: 5, title: created.title, content: created.content,
            }, files));
            const overview = await screen.findByRole('region', { name: '리뷰 사진 모아보기' });
            const photoTile = within(overview).getByRole('button', { name: '리뷰 사진 1 크게 보기' });
            expect(photoTile.style.aspectRatio).toBe('90 / 150');
            expect(within(screen.getByRole('article')).getByRole('group', { name: '리뷰 사진 1장' })).toBeInTheDocument();
        } finally {
            unmount();
            if (previous) Object.defineProperty(URL, 'createObjectURL', previous);
            else delete URL.createObjectURL;
            if (revoke) Object.defineProperty(URL, 'revokeObjectURL', revoke);
            else delete URL.revokeObjectURL;
        }
    });
    it('uses the feed composer and scrolls to the returned comment once it appears in the list', async () => {
        auth.user = { id: 7 };
        auth.isLoggedIn = true;
        reviewService.getReviewsByStore.mockResolvedValue([
            { id: 12, mine: false, memberName: '땅을 파는 두더지', authorAlias: '땅을 파는 두더지', rating: 4, title: '방문 리뷰',
                interactions: { liked: false, likeCount: 0, commentCount: 0 } },
        ]);
        reviewService.setLike.mockResolvedValue({ liked: true, likeCount: 1 });
        reviewService.listComments.mockResolvedValue({ content: [], size: 20, totalPages: 0, totalElements: 0 });
        const saved = { id: 51, authorName: '작성자', content: '댓글을 남겼어요.', createdAt: '2026-11-01T09:00:00Z' };
        reviewService.addComment.mockImplementation(async () => {
            reviewService.listComments.mockResolvedValue({
                content: [{ ...saved, id: 52, authorName: '다른 작성자', content: '가장 최근 댓글' }, saved],
                size: 20, totalPages: 1, totalElements: 2,
            });
            return { commentCount: 2, commentId: saved.id };
        });
        const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        const scroll = vi.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
        try {
            renderReviews();
            const card = await screen.findByRole('article');
            expect(reviewService.listComments).not.toHaveBeenCalled();
            fireEvent.click(within(card).getByRole('button', { name: '좋아요' }));
            expect(await within(card).findByRole('button', { name: '좋아요 취소' })).toHaveTextContent('1');
            expect(reviewService.setLike).toHaveBeenCalledWith(12, true);

            fireEvent.click(within(card).getByRole('button', { name: '댓글 보기' }));
            expect(await screen.findByText('아직 댓글이 없어요.')).toBeInTheDocument();
            expect(within(card).getByRole('button', { name: '이모지 선택' })).toBeInTheDocument();
            const input = within(card).getByRole('textbox', { name: '리뷰 댓글 작성' });
            expect(input).toHaveAttribute('maxlength', '500');
            fireEvent.change(input, { target: { value: ' 댓글을 남겼어요. ' } });
            fireEvent.click(within(card).getByRole('button', { name: '댓글 남기기' }));
            const comment = await within(card).findByRole('article', { name: '작성자의 댓글' });
            expect(comment).toHaveTextContent(saved.content);
            await waitFor(() => expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'smooth' }));
            expect(scroll.mock.contexts[0]).toBe(comment.parentElement);
            expect(comment.parentElement).toHaveFocus();
            expect(within(card).getByRole('button', { name: '댓글 접기' })).toHaveTextContent('2');
            expect(reviewService.addComment).toHaveBeenCalledExactlyOnceWith(12, { content: saved.content, clientRequestId: expect.any(String) });
        } finally {
            if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previous);
            else delete HTMLElement.prototype.scrollIntoView;
        }
    });
    it.each([
        { isPC: false, width: 360, first: 2 },
        { isPC: true, width: 1440, first: 6 },
        { isPC: true, width: 950, first: 4 },
        { isPC: true, width: 1700, first: 7 },
    ])('fills the first photo row at $width px and only expands additional rows', async ({ isPC, width, first }) => {
        let resize;
        const OriginalObserver = globalThis.ResizeObserver;
        vi.stubGlobal('ResizeObserver', class extends OriginalObserver {
            constructor(callback) { super(callback); this.callback = callback; }
            observe(node) {
                super.observe(node);
                if (node.classList.contains('reserve-review-photo-grid')) resize = this.callback;
            }
        });
        const photos = Array.from({ length: 7 }, (_, index) => ({
            id: index + 1, url: '/api/reviews/12/photos/' + (index + 1), width: 180, height: 320,
        }));
        reviewService.getReviewsByStore.mockResolvedValue([
            { id: 12, rating: 5, title: '사진 리뷰 1', photos: photos.slice(0, 5) },
            { id: 13, rating: 5, title: '사진 리뷰 2', photos: photos.slice(5) },
        ]);
        const view = renderReviews({ isPC });
        try {
            const overview = await screen.findByRole('region', { name: '리뷰 사진 모아보기' });
            const grid = overview.querySelector('.reserve-review-photo-grid');
            if (isPC) {
                grid.style.setProperty('--review-photo-min-width', '210px');
                grid.style.columnGap = '8px';
                vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ width });
                act(() => resize());
                expect(grid.style.getPropertyValue('--review-photo-columns')).toBe(String(first));
            }
            expect(within(overview).getAllByRole('button', { name: /리뷰 사진 \d+ 크게 보기/ })).toHaveLength(first);
            if (first < photos.length) {
                fireEvent.click(within(overview).getByRole('button', { name: '사진 더 보기' }));
                expect(within(overview).getByRole('button', { name: '사진 접기' })).toHaveAttribute('aria-expanded', 'true');
            } else expect(within(overview).queryByRole('button', { name: '사진 더 보기' })).toBeNull();
            expect(within(overview).getAllByRole('button', { name: /리뷰 사진 \d+ 크게 보기/ })).toHaveLength(7);
            expect(document.querySelector('.reserve-image-preview img')).toBeNull();
            const lastPhoto = within(overview).getByRole('button', { name: '리뷰 사진 7 크게 보기' });
            expect(lastPhoto.parentElement).toBe(within(overview).getByRole('button', { name: '리뷰 사진 1 크게 보기' }).parentElement);
            fireEvent.click(lastPhoto);
            await waitFor(() => expect(document.querySelector('.reserve-image-preview img')).toHaveAttribute('src', photos[6].url));
        } finally {
            view.unmount(); view.client.clear();
            vi.unstubAllGlobals();
        }
    });

    it.each(['mouse', 'touch'])('keeps short %s drags in place and leaves touch scrolling to the browser', async pointerType => {
        const photos = [1, 2].map(id => ({ id, url: `/api/reviews/12/photos/${id}`, width: 300, height: 200 }));
        reviewService.getReviewsByStore.mockResolvedValue([{ id: 12, rating: 5, title: '사진 리뷰', photos }]);
        renderReviews();
        const strip = await screen.findByRole('group', { name: /리뷰 사진 2장/ });
        const scrollTo = vi.fn();
        Object.defineProperties(strip, { scrollWidth: { value: 600 }, clientWidth: { value: 300 }, scrollTo: { value: scrollTo } });
        strip.querySelectorAll('.reserve-feed-media-item').forEach((photo, index) => {
            vi.spyOn(photo, 'getBoundingClientRect').mockImplementation(() => ({ left: index * 300 - strip.scrollLeft }));
        });
        const pointer = (type, clientX, clientY, timeStamp, target = strip) => {
            const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
            Object.defineProperty(event, 'timeStamp', { value: timeStamp });
            fireEvent(target, Object.assign(event, { pointerId: 1, pointerType, isPrimary: true }));
        };
        pointer('pointerdown', 150, 40, 1);
        pointer('pointermove', 129, 130, 200);
        pointer('pointerup', 129, 130, 300);
        expect(scrollTo).not.toHaveBeenCalled();

        pointer('pointerdown', 150, 40, 400);
        pointer('pointermove', 129, 43, 600);
        if (pointerType === 'touch') pointer('lostpointercapture', 129, 43, 650, strip.querySelector('.reserve-feed-media-item'));
        pointer('pointerup', 129, 43, 700);
        await waitFor(() => expect(strip.scrollLeft).toBe(0));

        pointer('pointerdown', 250, 40, 800);
        pointer('pointermove', 50, 43, 1000);
        pointer('pointerup', 50, 43, 1100);
        await waitFor(() => expect(strip.scrollLeft).toBe(pointerType === 'mouse' ? 300 : 0));

        scrollTo.mockClear();
        strip.scrollLeft = 0;
        pointer('pointerdown', 150, 40, 1200);
        pointer('pointermove', 129, 43, 1400);
        pointer('lostpointercapture', 129, 43, 1450);
        pointer('pointerup', 129, 43, 1500);
        expect(scrollTo).not.toHaveBeenCalled();
        expect(strip.scrollLeft).toBeLessThan(300);
    });
    it('moves to an adjacent narrow photo with the arrow keys', async () => {
        const photos = [1, 2, 3, 4, 5, 6].map(id => ({ id, url: `/api/reviews/12/photos/${id}`, width: 100, height: 200 }));
        reviewService.getReviewsByStore.mockResolvedValue([{ id: 12, rating: 5, title: '사진 리뷰', photos }]);
        renderReviews();
        const strip = await screen.findByRole('group', { name: /리뷰 사진 6장/ });
        Object.defineProperties(strip, { scrollWidth: { value: 600 }, clientWidth: { value: 300 } });
        strip.querySelectorAll('.reserve-feed-media-item').forEach((photo, index) => {
            vi.spyOn(photo, 'getBoundingClientRect').mockImplementation(() => ({ left: index * 100 - strip.scrollLeft }));
        });
        fireEvent.keyDown(strip, { key: 'ArrowRight' });
        await waitFor(() => expect(strip.scrollLeft).toBe(100));
        fireEvent.keyDown(strip, { key: 'ArrowRight' });
        await waitFor(() => expect(strip.scrollLeft).toBe(200));
        fireEvent.keyDown(strip, { key: 'ArrowLeft' });
        await waitFor(() => expect(strip.scrollLeft).toBe(100));
        fireEvent.keyDown(strip, { key: 'End' });
        await waitFor(() => expect(strip.scrollLeft).toBe(300));
        fireEvent.keyDown(strip, { key: 'Home' });
        await waitFor(() => expect(strip.scrollLeft).toBe(0));
    });

    it.each(['create', 'edit'])('preserves the %s draft and local photos after a background read failure', async mode => {
        auth.user = { id: 7 };
        auth.isLoggedIn = true;
        feedService.myProfile.mockResolvedValue({ visibility: 'PUBLIC', nickname: '내 프로필' });
        reviewService.getReviewsByStore.mockResolvedValue(mode === 'edit'
            ? [{ id: 12, mine: true, rating: 4, title: '기존 리뷰', content: '친절하게 안내해주셨어요.' }] : []);
        const createUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
        const revokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
        const revoke = vi.fn();
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:draft-photo' });
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
        const view = renderReviews(mode === 'create' ? { completedReservation: { reservationId: 91 } } : {});
        try {
            if (mode === 'edit') {
                fireEvent.click(await screen.findByRole('button', { name: '리뷰 메뉴' }));
                fireEvent.click(await screen.findByRole('menuitem', { name: '리뷰 수정' }));
            }
            const name = mode === 'create' ? '리뷰 작성' : '리뷰 수정';
            const form = await screen.findByRole('form', { name });
            fireEvent.change(within(form).getByRole('textbox', { name: '리뷰 제목' }), { target: { value: '작성 중인 제목' } });
            fireEvent.change(within(form).getByRole('textbox', { name: '리뷰 내용' }), { target: { value: '아직 저장하지 않은 방문 후기예요.' } });
            fireEvent.change(form.querySelector('input[type="file"]'), {
                target: { files: [new File(['photo'], 'draft.png', { type: 'image/png' })] },
            });
            await waitFor(() => expect(form.querySelectorAll('.ant-upload-list-item-container')).toHaveLength(1));
            reviewService.getReviewsByStore.mockRejectedValue(new Error('offline'));
            await act(async () => { await view.client.invalidateQueries({ queryKey: reviewKeys.byStore(12), exact: true }); });
            expect(await screen.findByRole('alert')).toHaveTextContent('리뷰를 갱신하지 못했어요.');
            expect(screen.getByRole('form', { name })).toBe(form);
            expect(within(form).getByRole('textbox', { name: '리뷰 제목' })).toHaveValue('작성 중인 제목');
            expect(within(form).getByRole('textbox', { name: '리뷰 내용' })).toHaveValue('아직 저장하지 않은 방문 후기예요.');
            expect(form.querySelectorAll('.ant-upload-list-item-container')).toHaveLength(1);
            expect(revoke).not.toHaveBeenCalled();
        } finally {
            view.unmount();
            view.client.clear();
            if (createUrl) Object.defineProperty(URL, 'createObjectURL', createUrl); else delete URL.createObjectURL;
            if (revokeUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeUrl); else delete URL.revokeObjectURL;
        }
    });

    it.each([403, 410])('removes cached review content and its editor when access becomes unavailable (%s)', async status => {
        auth.user = { id: 7 };
        auth.isLoggedIn = true;
        reviewService.getReviewsByStore.mockResolvedValue([{ id: 12, rating: 4, title: '캐시된 방문 후기' }]);
        const view = renderReviews({ completedReservation: { reservationId: 91 } });
        await screen.findByRole('form', { name: '리뷰 작성' });
        expect(screen.getByText('캐시된 방문 후기')).toBeInTheDocument();
        reviewService.getReviewsByStore.mockRejectedValue({ status, message: '조회할 수 없어요.' });
        await act(async () => { await view.client.invalidateQueries({ queryKey: reviewKeys.byStore(12), exact: true }); });
        await screen.findByRole('alert');
        expect(screen.queryByText('캐시된 방문 후기')).toBeNull();
        expect(screen.queryByRole('form', { name: '리뷰 작성' })).toBeNull();
        view.unmount(); view.client.clear();
    });

    it('separates an API failure from an empty list and retries', async () => {
        reviewService.getReviewsByStore.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
        renderReviews();
        expect(await screen.findByRole('alert')).toHaveTextContent('리뷰를 불러오지 못했어요.');
        expect(screen.queryByText(/아직 리뷰가 없어요/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByText(/아직 리뷰가 없어요/)).toBeInTheDocument();
    });

    it('keeps a failed review-eligibility check visible instead of treating it as no completed reservation', async () => {
        const retryEligibility = vi.fn();
        reviewService.getReviewsByStore.mockResolvedValue([]);
        renderReviews({
            completedReservationError: new Error('offline'),
            onCompletedReservationRetry: retryEligibility,
        });

        expect(await screen.findByRole('alert')).toHaveTextContent('리뷰 작성 가능 예약을 확인하지 못했어요.');
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(retryEligibility).toHaveBeenCalledOnce();
    });
});
