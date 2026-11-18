import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useManageReservations from '../useManageReservations';
import reservationService from '../../services/reservationService';
import { advanceSession } from '../../api/sessionScope';
import { handleApiError } from '../../utils/errorHandler';
import { reservationKeys } from '../queryKeys';

const message = vi.hoisted(() => ({ open: vi.fn(), destroy: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../useMessage', () => ({ default: () => ({ message }) }));
vi.mock('../../utils/errorHandler', () => ({ handleApiError: vi.fn() }));
vi.mock('../../services/reservationService', () => ({ default: {
    getStoreReservations: vi.fn(), noShowReservation: vi.fn(), undoNoShow: vi.fn(),
    completeReservation: vi.fn(), undoComplete: vi.fn(),
} }));

let client;
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const params = { page: 0, size: 20, storeId: 12 };
const show = () => renderHook(() => useManageReservations(params), { wrapper });
const undoButton = () => {
    render(message.open.mock.lastCall[0].content);
    return screen.getByRole('button', { name: '되돌리기', exact: true });
};

beforeEach(() => {
    vi.resetAllMocks();
    advanceSession();
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    reservationService.getStoreReservations.mockResolvedValue({
        content: [{ id: 7, status: 'CONFIRMED' }], page: { totalElements: 1, totalPages: 1 },
    });
    reservationService.noShowReservation.mockResolvedValue(undefined);
    reservationService.undoNoShow.mockResolvedValue(undefined);
});
afterEach(() => client.clear());

it('offers no-show undo for eight seconds and sends only one restoration for repeated clicks', async () => {
    const hook = show();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await act(async () => { await hook.result.current.noShow(7); });
    expect(reservationService.noShowReservation).toHaveBeenCalledExactlyOnceWith(7);
    expect(message.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        key: 'undo-noshow-7', type: 'success', duration: 8,
    }));

    let restore;
    reservationService.undoNoShow.mockImplementation(() => new Promise(resolve => { restore = resolve; }));
    const button = undoButton();
    expect(button).toHaveClass('reserve-text-link');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(reservationService.undoNoShow).toHaveBeenCalledExactlyOnceWith(7));
    await waitFor(() => expect(hook.result.current.actionLoading).toBe('undo-noshow-7'));
    expect(message.destroy).toHaveBeenCalledExactlyOnceWith('undo-noshow-7');
    await act(async () => { restore(); });
    await waitFor(() => expect(message.success).toHaveBeenCalledWith('노쇼 처리를 되돌렸어요.'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: reservationKeys.all() });
});

it('does not publish an undo toast or invalidate the new account after an earlier no-show request finishes', async () => {
    let finish;
    reservationService.noShowReservation.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const hook = show();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    let pending;
    act(() => { pending = hook.result.current.noShow(7); });
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    act(() => advanceSession());
    await act(async () => { finish(); await pending; });
    expect(message.open).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
});

it('closes an old undo toast without calling the restoration API after the account changes', async () => {
    const hook = show();
    await act(async () => { await hook.result.current.noShow(7); });
    const button = undoButton();
    act(() => advanceSession());
    fireEvent.click(button);
    expect(message.destroy).toHaveBeenCalledWith('undo-noshow-7');
    expect(reservationService.undoNoShow).not.toHaveBeenCalled();
});

it('reports restoration failures and keeps the management restoration action available', async () => {
    const failure = { status: 409, message: '확정된 노쇼 예약만 되돌릴 수 있어요.' };
    reservationService.undoNoShow.mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const hook = show();
    await act(async () => { await hook.result.current.noShow(7); });
    fireEvent.click(undoButton());
    await waitFor(() => expect(handleApiError).toHaveBeenCalledExactlyOnceWith(failure, message));
    await act(async () => { await hook.result.current.undoNoShow(7); });
    expect(reservationService.undoNoShow).toHaveBeenCalledTimes(2);
    expect(message.success).toHaveBeenCalledWith('노쇼 처리를 되돌렸어요.');
});

it('keeps attendance-refund completion outside the undo toast', async () => {
    reservationService.completeReservation.mockResolvedValue({ canUndo: false, refundRequested: true });
    const hook = show();
    await act(async () => { await hook.result.current.complete(7); });
    expect(message.open).not.toHaveBeenCalled();
    expect(message.success).toHaveBeenCalledWith('이용 완료로 처리했어요. 보증금 환불을 진행해요.');
    expect(reservationService.undoNoShow).not.toHaveBeenCalled();
});
