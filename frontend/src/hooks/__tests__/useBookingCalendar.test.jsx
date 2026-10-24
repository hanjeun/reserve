import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import useBookingCalendar from '../useBookingCalendar';
import api from '../../api/axios';
import reservationService from '../../services/reservationService';

vi.mock('../../api/axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../services/reservationService', () => ({ default: { getEditCalendar: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

const renderCalendar = props => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return renderHook(value => useBookingCalendar(value.storeId, value.month, value.reservationId), { wrapper, initialProps: props });
};

it('uses the preserved reservation context for an edit and never falls back to public calendar reads', async () => {
    reservationService.getEditCalendar.mockResolvedValue([{ date: '2030-01-01', status: 'OPEN' }]);
    const { result } = renderCalendar({ storeId: 10, month: '2030-01', reservationId: 31 });
    await waitFor(() => expect(result.current.byDate['2030-01-01']?.status).toBe('OPEN'));
    expect(reservationService.getEditCalendar).toHaveBeenCalledWith(31, 10, '2030-01', { signal: expect.any(AbortSignal) });
    expect(api.get).not.toHaveBeenCalled();
});

it('keeps a rejected edit context as an error without querying public discovery routes', async () => {
    reservationService.getEditCalendar.mockRejectedValue(Object.assign(new Error('변경할 수 없는 예약이에요.'), { status: 403 }));
    const { result } = renderCalendar({ storeId: 10, month: '2030-01', reservationId: 31 });
    await waitFor(() => expect(result.current.error).toBe('변경할 수 없는 예약이에요.'));
    expect(result.current.byDate).toEqual({});
    expect(api.get).not.toHaveBeenCalled();
});

it('does not carry a previous reservation calendar into a different unverified edit context', async () => {
    reservationService.getEditCalendar.mockResolvedValueOnce([{ date: '2030-01-01', status: 'OPEN' }])
        .mockImplementationOnce(() => new Promise(() => {}));
    const view = renderCalendar({ storeId: 10, month: '2030-01', reservationId: 31 });
    await waitFor(() => expect(view.result.current.byDate['2030-01-01']).toBeDefined());
    view.rerender({ storeId: 10, month: '2030-02', reservationId: 32 });
    expect(view.result.current.byDate).toEqual({});
    expect(view.result.current.loading).toBe(true);
    expect(api.get).not.toHaveBeenCalled();
});
