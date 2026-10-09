import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReviewList from './ReviewList';
import reviewService from '../../services/reviewService';

vi.mock('../../hooks', async (importOriginal) => ({
    ...(await importOriginal()),
    useMessage: () => ({ message: { success: vi.fn(), error: vi.fn() }, confirm: vi.fn() }),
}));
vi.mock('../../services/reviewService', () => ({ default: { getReviewsByStore: vi.fn(), createReview: vi.fn(), updateReview: vi.fn(), deleteReview: vi.fn() } }));
vi.mock('../../store/useAuthStore', () => {
    const state = { user: null, isLoggedIn: false, sessionRevision: 0 };
    return { default: Object.assign(selector => selector ? selector(state) : state, {
        getState: () => state,
        subscribe: () => () => {},
    }) };
});
const renderReviews = (props = {}) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReviewList storeId={12} {...props} /></QueryClientProvider>);

describe('review read states', () => {
    beforeEach(() => vi.clearAllMocks());
    it('submits a review only for the eligible completed reservation and trims its text', async () => {
        const created = { id: 73, memberName: '시험 회원', rating: 5, title: '방문 후기', content: '편안하고 친절한 서비스였습니다.' };
        reviewService.getReviewsByStore.mockResolvedValue([]);
        reviewService.createReview.mockResolvedValue(created);
        renderReviews({ completedReservation: { reservationId: 91, reviewId: null } });
        fireEvent.change(await screen.findByPlaceholderText('리뷰 제목을 입력해주세요'), { target: { value: '  방문 후기  ' } });
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
