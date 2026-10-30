import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useReservationAdmission from '../useReservationAdmission';
import useAuthStore from '../../store/useAuthStore';
import admissionService from '../../services/admissionService';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../services/admissionService', () => ({ default: { find: vi.fn(), join: vi.fn(), status: vi.fn(), cancel: vi.fn() } }));

const KEY = 'reserve-admission-attempts-v1';
const TICKET = '11111111-1111-4111-8111-111111111111';
const REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const saved = { version: 1, owner: { userId: '7', role: 'USER' }, attempts: {
    'sale-1': { campaignId: 'sale-1', ticket: TICKET, requestId: REQUEST, expiresAt: 0 },
} };

describe('admission recovery during first auth bootstrap', () => {
    afterEach(() => {
        sessionStorage.clear();
        localStorage.removeItem('auth-storage');
        vi.restoreAllMocks();
    });

    it('keeps the same ticket and request across anonymous /me restoration, then clears a live re-login', async () => {
        sessionStorage.setItem(KEY, JSON.stringify(saved));
        admissionService.find.mockResolvedValue({ id: 'sale-1', opensAt: '2026-10-23T00:00:00Z',
            closesAt: '2026-10-24T00:00:00Z', leaseSeconds: 180 });
        const randomUUID = vi.spyOn(crypto, 'randomUUID');
        const view = renderHook(() => useReservationAdmission());

        expect(useAuthStore.getState().user).toBeNull();
        api.get.mockResolvedValue({ member: { id: 7, role: 'USER', email: 'member@example.com' } });
        await act(async () => { await useAuthStore.getState().initializeAuth(); });

        expect(api.get).toHaveBeenCalledWith('/api/auth/session', { skipAuthRefresh: true, timeout: 8000 });
        expect(useAuthStore.getState()).toMatchObject({ user: { id: 7 }, authRestoring: false, sessionRevision: 1 });
        expect(JSON.parse(sessionStorage.getItem(KEY))).toEqual(saved);
        await expect(view.result.current.getPendingAttempt({ storeId: 31, date: '2026-10-23', time: '10:00' }))
            .resolves.toEqual(saved.attempts['sale-1']);
        expect(admissionService.join).not.toHaveBeenCalled();
        expect(admissionService.status).not.toHaveBeenCalled();
        expect(randomUUID).not.toHaveBeenCalled();

        act(() => useAuthStore.getState().login({ id: 7, role: 'USER', email: 'member@example.com' }));
        expect(sessionStorage.getItem(KEY)).toBeNull();
        view.unmount();
    });
});
