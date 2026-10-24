import { beforeEach, expect, it, vi } from 'vitest';
import api from '../api/axios';
import admissionService from './admissionService';

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
beforeEach(() => Object.values(api).forEach(mock => mock.mockReset().mockResolvedValue(null)));

it('uses the same-origin admission contract and sends ticket bodies for status and cancellation', async () => {
    const scope = { storeId: 31, date: '2026-10-23', time: '10:00' };
    const signal = new AbortController().signal;
    await admissionService.find(scope, signal);
    expect(api.get).toHaveBeenCalledWith('/api/reservations/admission', { params: scope, signal });
    await admissionService.join('sale-1', signal);
    expect(api.post).toHaveBeenLastCalledWith('/api/reservations/admission/sale-1', undefined, { signal });
    await admissionService.status('sale-1', 'ticket', signal);
    expect(api.post).toHaveBeenLastCalledWith('/api/reservations/admission/sale-1/status', { ticket: 'ticket' }, { signal });
    await admissionService.cancel('sale-1', 'ticket', signal);
    expect(api.delete).toHaveBeenCalledWith('/api/reservations/admission/sale-1', { data: { ticket: 'ticket' }, signal });
});
