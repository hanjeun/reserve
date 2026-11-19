import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useReservations from '../useReservations';
import reservationService from '../../services/reservationService';
import { reservationKeys } from '../queryKeys';
import { handleApiError } from '../../utils/errorHandler';
import useAuthStore from '../../store/useAuthStore';

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

it('leaves read failures to the page state and keeps cancellation failure feedback', async () => {
    const failure = { code: 'ERR_NETWORK' };
    reservationService.getMyReservations.mockRejectedValue(failure);
    reservationService.cancelReservation.mockRejectedValue(failure);
    const hook = renderHook(() => useReservations(), { wrapper });
    await waitFor(() => expect(hook.result.current.error).toBe(failure));
    expect(handleApiError).not.toHaveBeenCalled();
    await act(async () => {
        await expect(hook.result.current.cancelReservation(7)).rejects.toBe(failure);
    });
    expect(handleApiError).toHaveBeenCalledOnce();
    expect(handleApiError).toHaveBeenCalledWith(failure, expect.anything(), '예약 취소에 실패했어요');
});

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
    expect(reservationService.getMyReservations).toHaveBeenLastCalledWith(second, expect.any(AbortSignal));
});

it('정렬 중 같은 세션의 예약만 유지하고 계정이 바뀌면 즉시 숨긴다', async () => {
    const auth = useAuthStore.getState();
    let previousResponse, nextResponse;
    const oldSort = { page: 1, size: 15, status: 'CONFIRMED', sort: 'recent' };
    const nextSort = { ...oldSort, page: 0, sort: 'oldest' };
    useAuthStore.setState({ isLoggedIn: true, user: { id: 41 }, sessionRevision: 22 });
    reservationService.getMyReservations
        .mockResolvedValueOnce({ content: [{ id: 7 }], totalElements: 22 })
        .mockImplementationOnce(() => new Promise(resolve => { previousResponse = resolve; }))
        .mockImplementationOnce(() => new Promise(resolve => { nextResponse = resolve; }));
    const hook = renderHook(({ params }) => useReservations(params), { initialProps: { params: oldSort }, wrapper });
    try {
        await waitFor(() => expect(hook.result.current.reservations).toEqual([{ id: 7 }]));
        hook.rerender({ params: nextSort });
        await waitFor(() => expect(previousResponse).toBeTypeOf('function'));
        expect(hook.result.current).toMatchObject({ sorting: true, loading: false, resultPage: 2, resultSort: 'recent', reservations: [{ id: 7 }] });

        act(() => useAuthStore.setState({ user: { id: 42 }, sessionRevision: 23 }));
        await waitFor(() => expect(nextResponse).toBeTypeOf('function'));
        expect(hook.result.current).toMatchObject({ sorting: false, reservations: [] });
        await act(async () => previousResponse({ content: [{ id: 8 }] }));
        expect(hook.result.current.reservations).toEqual([]);
        await act(async () => nextResponse({ content: [{ id: 9 }] }));
        await waitFor(() => expect(hook.result.current.reservations).toEqual([{ id: 9 }]));
    } finally {
        hook.unmount();
        useAuthStore.setState(auth, true);
    }
});

it('keeps the page count but hides previous page reservations while the next page is loading', async () => {
    const auth = useAuthStore.getState();
    useAuthStore.setState({ isLoggedIn: true, user: { id: 41 }, sessionRevision: 22 });
    let resolvePage;
    reservationService.getMyReservations.mockResolvedValueOnce({ content: [{ id: 7 }], totalElements: 22, totalPages: 2 })
        .mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
    const first = { page: 0, size: 20, sort: 'recent' };
    const hook = renderHook(({ params }) => useReservations(params), { initialProps: { params: first }, wrapper });
    try {
        await waitFor(() => expect(hook.result.current.reservations).toEqual([{ id: 7 }]));
        hook.rerender({ params: { ...first, page: 1 } });
        expect(hook.result.current).toMatchObject({ hasData: true, loading: true, reservations: [], total: 22, resultPage: 2 });
        await act(async () => resolvePage({ content: [{ id: 8 }], totalElements: 22, totalPages: 2 }));
        await waitFor(() => expect(hook.result.current).toMatchObject({ loading: false, reservations: [{ id: 8 }] }));
    } finally {
        hook.unmount();
        useAuthStore.setState(auth, true);
    }
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
