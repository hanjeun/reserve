import { beforeEach, expect, it, vi } from 'vitest';
import api from '../api/axios';
import reservationService from './reservationService';

vi.mock('../api/axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
beforeEach(() => { api.post.mockReset(); api.get.mockReset(); });

it('binds edit-context reads to both the owned reservation and the current store without calling public browsing routes', async () => {
    const signal = new AbortController().signal;
    await reservationService.getEditStore(31, 10, { signal });
    expect(api.get).toHaveBeenLastCalledWith('/api/reservations/31/edit-store', { params: { storeId: 10 }, signal });
    await reservationService.getEditAvailability(31, 10, '2030-01-02', { signal });
    expect(api.get).toHaveBeenLastCalledWith('/api/reservations/31/availability', { params: { storeId: 10, date: '2030-01-02' }, signal });
    await reservationService.getEditCalendar(31, 10, '2030-01', { signal });
    expect(api.get).toHaveBeenLastCalledWith('/api/reservations/31/calendar', { params: { storeId: 10, month: '2030-01' }, signal });
    expect(api.post).not.toHaveBeenCalled();
});

it('forwards my-reservation pagination and server filters without truncating the page response', async () => {
    const params = { page: 3, size: 15, search: '예약', status: 'PENDING', sort: 'visit' };
    const result = { content: [{ id: 23 }], page: { totalElements: 46, totalPages: 4 } };
    api.get.mockResolvedValueOnce(result);
    await expect(reservationService.getMyReservations(params)).resolves.toBe(result);
    expect(api.get).toHaveBeenCalledWith('/api/reservations/my/page', { params });
    await reservationService.getMyReservations();
    expect(api.get).toHaveBeenLastCalledWith('/api/reservations/my/page', { params: {} });
});

it('uses the read-only request-result endpoint with the original payload and cancellation signal', async () => {
    const data = { storeId: 10, reservationDate: '2030-01-01', reservationTime: '12:00', guestCount: 1,
        requestId: '11111111-1111-4111-8111-111111111111' };
    const signal = new AbortController().signal;
    api.post.mockResolvedValueOnce({ outcome: 'NOT_SUBMITTED', reservation: null });
    await expect(reservationService.recoverReservation(data, { signal })).resolves.toEqual({ outcome: 'NOT_SUBMITTED', reservation: null });
    expect(api.post).toHaveBeenCalledWith('/api/reservations/requests/result', data, { signal });
    api.post.mockResolvedValueOnce({ outcome: 'RESERVED', reservation: { id: 23 } });
    await expect(reservationService.recoverReservation(data)).resolves.toEqual({ outcome: 'RESERVED', reservation: { id: 23 } });
    expect(api.post).toHaveBeenLastCalledWith('/api/reservations/requests/result', data, {});
});
