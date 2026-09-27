import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReviewList from './ReviewList';
import reviewService from '../../services/reviewService';

vi.mock('../../services/reviewService', () => ({ default: { getReviewsByStore: vi.fn(), createReview: vi.fn(), updateReview: vi.fn(), deleteReview: vi.fn() } }));
vi.mock('../../store/useAuthStore', () => ({ default: () => ({ user: null }) }));
const renderReviews = (props = {}) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReviewList storeId={12} {...props} /></QueryClientProvider>);

describe('review read states', () => {
    beforeEach(() => vi.clearAllMocks());
    it('shows the existing card skeleton during the initial request', () => {
        reviewService.getReviewsByStore.mockImplementation(() => new Promise(() => {}));
        renderReviews();
        expect(screen.getByRole('status', { name: '리뷰를 불러오는 중' })).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByText(/아직 리뷰가 없습니다/)).toBeNull();
    });
    it('separates an API failure from an empty list and retries', async () => {
        reviewService.getReviewsByStore.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
        renderReviews();
        expect(await screen.findByRole('alert')).toHaveTextContent('리뷰를 불러오지 못했습니다.');
        expect(screen.queryByText(/아직 리뷰가 없습니다/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByText(/아직 리뷰가 없습니다/)).toBeInTheDocument();
    });

    it('keeps a failed review-eligibility check visible instead of treating it as no completed reservation', async () => {
        const retryEligibility = vi.fn();
        reviewService.getReviewsByStore.mockResolvedValue([]);
        renderReviews({
            completedReservationError: new Error('offline'),
            onCompletedReservationRetry: retryEligibility,
        });

        expect(await screen.findByRole('alert')).toHaveTextContent('리뷰 작성 가능 예약을 확인하지 못했습니다.');
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(retryEligibility).toHaveBeenCalledOnce();
    });
});
