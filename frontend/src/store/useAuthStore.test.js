import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useAuthStore from './useAuthStore';
import api from '../api/axios';
vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }));

const a = { id: 1, name: 'A', email: 'a@example.test', role: 'USER' };
const b = { id: 2, name: 'B', email: 'b@example.test', role: 'USER' };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('auth identity transitions', () => {
    beforeEach(() => { useAuthStore.getState().logout(); api.get.mockReset(); });
    afterEach(() => vi.useRealTimers());
    it('A checkAuth success cannot restore A after B logs in', async () => {
        useAuthStore.getState().login(a);
        const pending = deferred();
        api.get.mockReturnValueOnce(pending.promise);
        const checked = useAuthStore.getState().checkAuth();
        useAuthStore.getState().login(b);
        pending.resolve(a);
        await checked;
        expect(useAuthStore.getState().user).toEqual(b);
    });
    it('A 401 cannot log out B and A success cannot undo logout', async () => {
        useAuthStore.getState().login(a);
        const pending = deferred();
        api.get.mockReturnValueOnce(pending.promise);
        const checked = useAuthStore.getState().checkAuth();
        useAuthStore.getState().login(b);
        pending.reject({ status: 401 });
        await checked;
        expect(useAuthStore.getState().user).toEqual(b);
        const later = deferred();
        api.get.mockReturnValueOnce(later.promise);
        const checkB = useAuthStore.getState().checkAuth();
        useAuthStore.getState().logout();
        later.resolve(b);
        await checkB;
        expect(useAuthStore.getState().user).toBeNull();
    });
    it('same identity refresh keeps its cache but role and login transitions rotate it', async () => {
        useAuthStore.getState().login(a);
        const previous = useAuthStore.getState().sessionRevision;
        api.get.mockResolvedValueOnce({ ...a, name: 'updated' });
        await useAuthStore.getState().checkAuth();
        expect(useAuthStore.getState().sessionRevision).toBe(previous);
        api.get.mockResolvedValueOnce({ ...a, role: 'BUSINESS' });
        await useAuthStore.getState().checkAuth();
        expect(useAuthStore.getState().sessionRevision).toBeGreaterThan(previous);
    });

    it('profile refresh is not a login and an old profile cannot replace another account', () => {
        useAuthStore.getState().login(a);
        const previous = useAuthStore.getState().sessionRevision;
        useAuthStore.getState().updateUser({ ...a, name: 'renamed' });
        expect(useAuthStore.getState().sessionRevision).toBe(previous);
        useAuthStore.getState().login(b);
        useAuthStore.getState().updateUser({ ...a, name: 'late A' });
        expect(useAuthStore.getState().user).toEqual(b);
    });

    it('retries a transient startup failure before showing an anonymous session', async () => {
        vi.useFakeTimers();
        api.get.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce(a);

        const initialized = useAuthStore.getState().initializeAuth();
        await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
        await vi.advanceTimersByTimeAsync(400);

        await expect(initialized).resolves.toEqual(a);
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(useAuthStore.getState().user).toEqual(a);
    });

    it('does not retry when the server confirms that the session expired', async () => {
        api.get.mockRejectedValueOnce({ status: 401 });

        await expect(useAuthStore.getState().initializeAuth()).resolves.toBeNull();

        expect(api.get).toHaveBeenCalledTimes(1);
        expect(useAuthStore.getState().user).toBeNull();
    });
});
