import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.hoisted(() => vi.fn());
const reservationService = vi.hoisted(() => ({
    getReservation: vi.fn(),
    getMyCompletedForStore: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useNavigate: () => navigate,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../services/reservationService', () => ({ default: reservationService }));
vi.mock('../../services/adService', () => ({ default: { recordConversion: vi.fn() } }));
vi.mock('../../utils/adAttribution', () => ({ consumeAdClickAttribution: vi.fn() }));

import useStoreDetailActions from '../useStoreDetailActions';

const editable = {
    id: 91, storeId: 12, status: 'PENDING', depositPaid: false,
    reservationDate: '2026-10-01', reservationTime: '10:00:00', guestCount: 2, specialRequest: '',
};

const httpError = (status) => Object.assign(new Error('요청에 실패했습니다.'), { status });

function renderEditHook(message) {
    const form = { setFieldsValue: vi.fn() };
    const wrapper = ({ children }) => (
        <MemoryRouter initialEntries={['/store/12?edit=91']}>{children}</MemoryRouter>
    );
    return renderHook(props => useStoreDetailActions({
        id: '12', store: { id: 12 }, isLoggedIn: true, user: { id: 7 }, form, pay: vi.fn(), message, ...props,
    }), { wrapper, initialProps: {} });
}

describe('useStoreDetailActions edit lookup', () => {
    let message;

    beforeEach(() => {
        navigate.mockReset();
        reservationService.getReservation.mockReset();
        reservationService.getMyCompletedForStore.mockReset().mockResolvedValue(null);
        message = { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() };
    });

    it('keeps the customer on the page and retries after a network failure', async () => {
        reservationService.getReservation
            .mockRejectedValueOnce(new Error('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'))
            .mockResolvedValueOnce(editable);

        const { result } = renderEditHook(message);

        await waitFor(() => expect(result.current.editLoadError).toBeInstanceOf(Error));
        expect(navigate).not.toHaveBeenCalled();
        expect(message.error).not.toHaveBeenCalled();
        expect(result.current.editingReservation).toBeNull();

        act(() => { result.current.retryEditLoad(); });
        expect(result.current.editRetrying).toBe(true);

        await waitFor(() => expect(result.current.editingReservation).toEqual(editable));
        expect(result.current.editLoadError).toBeNull();
        expect(result.current.editRetrying).toBe(false);
        expect(reservationService.getReservation).toHaveBeenCalledTimes(2);
    });

    it.each([
        [404, '예약을 찾을 수 없습니다.'],
        [403, '변경할 수 없는 예약입니다.'],
    ])('sends the customer back to their reservations for a %i that a retry cannot fix', async (status, text) => {
        reservationService.getReservation.mockRejectedValueOnce(httpError(status));

        const { result } = renderEditHook(message);

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/my-reservations', { replace: true }));
        expect(message.error).toHaveBeenCalledWith(text);
        expect(result.current.editLoadError).toBeNull();
    });

    it('clears the previous account edit and review state before the next lookup completes', async () => {
        reservationService.getReservation.mockResolvedValue(editable);
        reservationService.getMyCompletedForStore.mockResolvedValue({ id: 19, reviewId: 5 });
        const { result, rerender } = renderEditHook(message);
        await waitFor(() => expect(result.current.completedReservation).toEqual({ reservationId: 19, reviewId: 5 }));
        expect(result.current.editingReservation).toEqual(editable);
        const newEdit = new Promise(() => {});
        reservationService.getReservation.mockReturnValueOnce(newEdit);
        reservationService.getMyCompletedForStore.mockReturnValueOnce(new Promise(() => {}));
        rerender({ user: { id: 8 } });
        expect(result.current.completedReservation).toBeNull();
        expect(result.current.editingReservation).toBeNull();
        expect(result.current.reviewEligibilityLoading).toBe(true);
        rerender({ isLoggedIn: false, user: null });
        expect(result.current.reviewEligibilityLoading).toBe(false);
        expect(result.current.completedReservation).toBeNull();
    });

    it('ignores a stale review response and exposes retry loading without retaining old eligibility', async () => {
        reservationService.getReservation.mockResolvedValue(editable);
        let resolveOld;
        let resolveNew;
        reservationService.getMyCompletedForStore
            .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
            .mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));
        const { result, rerender } = renderEditHook(message);
        rerender({ user: { id: 8 } });
        await act(async () => { resolveOld({ id: 19 }); });
        expect(result.current.completedReservation).toBeNull();
        expect(result.current.reviewEligibilityLoading).toBe(true);
        await act(async () => { resolveNew({ id: 29 }); });
        expect(result.current.completedReservation).toEqual({ reservationId: 29, reviewId: null });
        reservationService.getMyCompletedForStore.mockRejectedValueOnce(new Error('offline'));
        act(() => { result.current.refetchReviewEligibility(); });
        expect(result.current.reviewEligibilityLoading).toBe(true);
        expect(result.current.completedReservation).toBeNull();
        await waitFor(() => expect(result.current.reviewEligibilityError).toBeInstanceOf(Error));
        expect(result.current.reviewEligibilityLoading).toBe(false);
    });
});
