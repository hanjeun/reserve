import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useReservations from '../useReservations';
import reservationService from '../../services/reservationService';
import { reservationKeys } from '../queryKeys';

vi.mock('../../services/reservationService', () => ({ default: { getMyReservations: vi.fn(), cancelReservation: vi.fn() } }));
vi.mock('../useMessage', () => ({ default: () => ({ message: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../useLiveUpdatesStatus', () => ({ default: () => ({ connected: true, domains: ['RESERVATION'] }) }));
vi.mock('../../utils/errorHandler', () => ({ handleApiError: vi.fn() }));

let client;
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
});
afterEach(() => client.clear());

it('keeps each server page in a separate cache and accepts nested and legacy page metadata', async () => {
    const first = { page: 0, size: 15, sort: 'recent' };
    const second = { page: 1, size: 15, status: 'COMPLETED', sort: 'oldest' };
    reservationService.getMyReservations.mockImplementation(async params => params.page === 0
        ? { content: [{ id: 30, status: 'PENDING' }], page: { totalElements: 31, totalPages: 3 } }
        : { content: [{ id: 9, status: 'COMPLETED', reviewId: 4 }], totalElements: 16, totalPages: 2 });
    const hook = renderHook(({ params }) => useReservations(params), { initialProps: { params: first }, wrapper });
    await waitFor(() => expect(hook.result.current.reservations).toEqual([{ id: 30, status: 'PENDING' }]));
    expect(hook.result.current.total).toBe(31);
    hook.rerender({ params: second });
    await waitFor(() => expect(hook.result.current.reservations[0]?.id).toBe(9));
    expect(hook.result.current.total).toBe(16);
    expect(hook.result.current.totalPages).toBe(2);
    expect(client.getQueryData(reservationKeys.myPage(first)).content[0].id).toBe(30);
    expect(reservationService.getMyReservations).toHaveBeenLastCalledWith(second);
});

it('cancellation invalidates every page and preserves filtered content and totals until server revalidation', async () => {
    const params = { page: 0, size: 15, status: 'PENDING' };
    const anotherPage = reservationKeys.myPage({ page: 1, size: 15, status: 'COMPLETED' });
    client.setQueryData(anotherPage, { content: [{ id: 3 }], page: { totalElements: 16, totalPages: 2 } });
    reservationService.getMyReservations.mockResolvedValueOnce({ content: [{ id: 7, status: 'PENDING' }], page: { totalElements: 1, totalPages: 1 } })
        .mockResolvedValue({ content: [], page: { totalElements: 0, totalPages: 0 } });
    let complete;
    reservationService.cancelReservation.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const hook = renderHook(() => useReservations(params), { wrapper });
    await waitFor(() => expect(hook.result.current.reservations[0]?.id).toBe(7));
    let cancellation;
    act(() => { cancellation = hook.result.current.cancelReservation(7); });
    await waitFor(() => expect(complete).toBeTypeOf('function'));
    expect(hook.result.current.reservations[0].status).toBe('PENDING');
    expect(hook.result.current.total).toBe(1);
    await act(async () => { complete(); await cancellation; });
    await waitFor(() => expect(hook.result.current.total).toBe(0));
    expect(client.getQueryState(anotherPage).isInvalidated).toBe(true);
});

it('an authorization failure hides previously cached rows and page counts', async () => {
    const params = { page: 0, size: 15 };
    reservationService.getMyReservations.mockResolvedValueOnce({ content: [{ id: 7 }], page: { totalElements: 1, totalPages: 1 } })
        .mockRejectedValueOnce({ response: { status: 403 } });
    const hook = renderHook(() => useReservations(params), { wrapper });
    await waitFor(() => expect(hook.result.current.hasData).toBe(true));
    await act(async () => { await hook.result.current.refetch(); });
    await waitFor(() => expect(hook.result.current.error?.response.status).toBe(403));
    expect(hook.result.current.reservations).toEqual([]);
    expect(hook.result.current.total).toBe(0);
    expect(hook.result.current.totalPages).toBe(0);
    expect(hook.result.current.hasData).toBe(false);
});
