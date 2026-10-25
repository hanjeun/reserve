import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useReservationAdmission from '../useReservationAdmission';
import useAuthStore from '../../store/useAuthStore';
import admissionService from '../../services/admissionService';
import * as admissionPolling from '../../utils/admissionPollingCoordinator';

vi.mock('../../store/useAuthStore', async () => {
    const { create } = await import('zustand');
    return { default: create(() => ({ user: null, sessionRevision: 0, authRestoring: false, isLoggingOut: false })) };
});
vi.mock('../../services/admissionService', () => ({ default: { find: vi.fn(), join: vi.fn(), status: vi.fn(), cancel: vi.fn() } }));

const KEY = 'reserve-admission-attempts-v1';
const NOW = Date.parse('2026-10-23T00:00:00Z');
const TICKET = '11111111-1111-4111-8111-111111111111';
const NEXT_TICKET = '22222222-2222-4222-8222-222222222222';
const REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEXT_REQUEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SCOPE = { storeId: 31, date: '2026-10-23', time: '10:00' };
const campaign = changes => ({ id: 'sale-1', opensAt: new Date(NOW - 1000).toISOString(),
    closesAt: new Date(NOW + 600000).toISOString(), leaseSeconds: 180, ...changes });
const status = (state, changes) => ({ campaignId: 'sale-1', state, ticket: TICKET,
    position: state === 'WAITING' ? 3 : 0, expiresAt: state === 'ADMITTED' ? Date.now() + 180000 : 0,
    serverTime: Date.now(), pollAfterSeconds: 4, ...changes });
const metadata = () => JSON.parse(sessionStorage.getItem(KEY));
const advance = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const views = [];
const renderAdmission = () => {
    const view = renderHook(() => useReservationAdmission());
    views.push(view);
    return view;
};
const start = async view => {
    let decision;
    act(() => { decision = view.result.current.enter(SCOPE); });
    await advance(1);
    return { decision };
};

describe('reservation admission scope and recovery', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(REQUEST).mockReturnValue(NEXT_REQUEST);
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        useAuthStore.setState({ user: { id: 7, role: 'USER' }, sessionRevision: 1, authRestoring: false, isLoggingOut: false });
        sessionStorage.clear();
        Object.values(admissionService).forEach(mock => mock.mockReset());
        admissionService.find.mockResolvedValue(campaign());
        admissionService.join.mockImplementation(() => Promise.resolve(status('WAITING')));
        admissionService.status.mockImplementation(() => Promise.resolve(status('WAITING')));
        admissionService.cancel.mockImplementation(() => Promise.resolve(status('CANCELLED')));
    });
    afterEach(() => {
        views.splice(0).forEach(view => view.unmount());
        vi.restoreAllMocks();
        vi.useRealTimers();
        sessionStorage.clear();
    });

    it('shares a successful null lookup and never bypasses a failed initial lookup', async () => {
        admissionService.find.mockResolvedValueOnce(null);
        const view = renderAdmission();
        await expect(view.result.current.getPendingAttempt(SCOPE)).resolves.toBeNull();
        const { decision } = await start(view);
        await expect(decision).resolves.toBeNull();
        expect(admissionService.find).toHaveBeenCalledOnce();
        expect(admissionService.join).not.toHaveBeenCalled();
        await advance(3001);
        const failure = Object.assign(new Error('unavailable'), { status: 503 });
        admissionService.find.mockRejectedValue(failure);
        await expect(view.result.current.getPendingAttempt(SCOPE)).rejects.toBe(failure);
        const next = await start(view);
        const settled = vi.fn(); next.decision.then(settled);
        await advance(20000);
        expect(settled).not.toHaveBeenCalled();
        expect(view.result.current.modalProps).toMatchObject({ open: true, error: failure, canContinue: false });
        expect(admissionService.join).not.toHaveBeenCalled();
        act(() => view.result.current.modalProps.onClose());
        await expect(next.decision).resolves.toBe(false);
    });

    it('waits for the explicit admitted decision and keeps the same key until reservation success', async () => {
        admissionService.status.mockImplementation(() => Promise.resolve(status('ADMITTED', {
            serverTime: Date.now() + 60000, expiresAt: Date.now() + 240000,
        })));
        const view = renderAdmission();
        const { decision } = await start(view);
        const settled = vi.fn(); decision.then(settled);
        expect(view.result.current.modalProps.status.state).toBe('WAITING');
        await advance(4000);
        expect(view.result.current.modalProps.canContinue).toBe(true);
        expect(settled).not.toHaveBeenCalled();
        const deadline = view.result.current.modalProps.status.expiresAt - 60000;
        act(() => view.result.current.modalProps.onContinue());
        await expect(decision).resolves.toEqual({ ticket: TICKET, requestId: REQUEST, expiresAt: deadline });
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: TICKET, requestId: REQUEST });
        act(() => view.result.current.complete({ ticket: TICKET, requestId: REQUEST }));
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('recovers after F5 and keeps closing separate from explicit server cancellation', async () => {
        const first = renderAdmission();
        const { decision } = await start(first);
        act(() => first.result.current.modalProps.onClose());
        await expect(decision).resolves.toBe(false);
        expect(admissionService.cancel).not.toHaveBeenCalled();
        first.unmount();
        const second = renderAdmission();
        await expect(second.result.current.getPendingAttempt(SCOPE)).resolves.toMatchObject({ ticket: TICKET, requestId: REQUEST });
        expect(admissionService.status).not.toHaveBeenCalled();
        const resumed = await start(second);
        expect(admissionService.join).toHaveBeenCalledOnce();
        expect(admissionService.status).toHaveBeenCalledWith('sale-1', TICKET, expect.any(AbortSignal));
        act(() => second.result.current.modalProps.onCancel());
        await advance(1);
        await expect(resumed.decision).resolves.toBe(false);
        expect(admissionService.cancel).toHaveBeenCalledWith('sale-1', TICKET, expect.any(AbortSignal));
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('restores a live grant and server-aligned deadline without reopening the queue, joining, or changing its request key', async () => {
        admissionService.join.mockResolvedValueOnce(status('ADMITTED'));
        const first = renderAdmission();
        const pending = await start(first);
        act(() => first.result.current.modalProps.onContinue());
        await pending.decision;
        first.unmount();
        admissionService.join.mockClear();
        const saved = sessionStorage.getItem(KEY);
        admissionService.status.mockResolvedValue(status('ADMITTED', { serverTime: Date.now() + 60000, expiresAt: Date.now() + 240000 }));
        const next = renderAdmission();
        await expect(next.result.current.restoreEntry(SCOPE)).resolves.toEqual({ ticket: TICKET, requestId: REQUEST, expiresAt: Date.now() + 180000 });
        expect(next.result.current.modalProps.open).toBe(false);
        expect(admissionService.join).not.toHaveBeenCalled();
        expect(admissionService.cancel).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(KEY)).toBe(saved);
    });

    it.each(['WAITING', 'EXPIRED', 'CONSUMED'])('does not turn a restored %s receipt into an active grant or discard result recovery', async state => {
        const saved = JSON.stringify({ version: 1, owner: { userId: '7', role: 'USER' }, attempts: {
            'sale-1': { campaignId: 'sale-1', ticket: TICKET, requestId: REQUEST, expiresAt: NOW + 180000 },
        } });
        sessionStorage.setItem(KEY, saved);
        admissionService.status.mockResolvedValueOnce(status(state));
        const view = renderAdmission();
        await expect(view.result.current.restoreEntry(SCOPE)).resolves.toBeNull();
        expect(sessionStorage.getItem(KEY)).toBe(saved);
        expect(view.result.current.modalProps.open).toBe(false);
        expect(admissionService.join).not.toHaveBeenCalled();
    });

    it('does not query admission or mint a ticket for a new store visit without saved entry metadata', async () => {
        const view = renderAdmission();
        await expect(view.result.current.restoreEntry(SCOPE)).resolves.toBeNull();
        expect(admissionService.find).not.toHaveBeenCalled();
        expect(admissionService.status).not.toHaveBeenCalled();
        expect(admissionService.join).not.toHaveBeenCalled();
    });

    it('does not extend a restored deadline by the network response delay', async () => {
        sessionStorage.setItem(KEY, JSON.stringify({ version: 1, owner: { userId: '7', role: 'USER' }, attempts: {
            'sale-1': { campaignId: 'sale-1', ticket: TICKET, requestId: REQUEST, expiresAt: NOW + 2000 },
        } }));
        let resolveStatus;
        admissionService.status.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = resolve; }));
        const view = renderAdmission();
        const restore = view.result.current.restoreEntry(SCOPE);
        await advance(1);
        await advance(3000);
        await act(async () => resolveStatus(status('ADMITTED', { serverTime: NOW, expiresAt: NOW + 2000 })));
        await expect(restore).resolves.toBeNull();
        expect(admissionService.join).not.toHaveBeenCalled();
        expect(metadata().attempts['sale-1'].requestId).toBe(REQUEST);
    });

    it('retains a join key through an unknown response and stores only allowlisted metadata', async () => {
        let finishOldJoin;
        admissionService.join.mockImplementationOnce(() => new Promise(resolve => { finishOldJoin = resolve; }));
        const first = renderAdmission();
        const pending = await start(first);
        expect(metadata().attempts['sale-1']).toEqual({ campaignId: 'sale-1', ticket: null, requestId: REQUEST, expiresAt: 0 });
        expect(Object.keys(metadata())).toEqual(['version', 'owner', 'attempts']);
        expect(metadata().owner).toEqual({ userId: '7', role: 'USER' });
        expect(JSON.stringify(metadata())).not.toContain(SCOPE.date);
        expect(JSON.stringify(metadata())).not.toContain(SCOPE.time);
        act(() => first.result.current.modalProps.onClose());
        await expect(pending.decision).resolves.toBe(false);
        first.unmount();
        const second = renderAdmission();
        await expect(second.result.current.getPendingAttempt(SCOPE)).resolves.toBeNull();
        await start(second);
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: TICKET, requestId: REQUEST });
        await act(async () => finishOldJoin(status('ADMITTED', { ticket: NEXT_TICKET })));
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: TICKET, requestId: REQUEST });
    });

    it('preserves a ticket during 503 polling backoff and stops polling while hidden', async () => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        const unavailable = Object.assign(new Error('unavailable'), { status: 503 });
        admissionService.status.mockRejectedValueOnce(unavailable);
        const view = renderAdmission();
        await start(view);
        await advance(4000);
        expect(view.result.current.modalProps.error).toBe(unavailable);
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: TICKET, requestId: REQUEST });
        visibility.mockReturnValue('hidden');
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        await advance(20000);
        expect(admissionService.status).toHaveBeenCalledOnce();
        visibility.mockReturnValue('visible');
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        await advance(1);
        expect(admissionService.status).toHaveBeenCalledTimes(2);
        expect(view.result.current.modalProps.error).toBeNull();
        expect(admissionService.join).toHaveBeenCalledOnce();
    });

    it('aborts an in-flight hidden status request and checks immediately when visible again', async () => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        admissionService.status.mockImplementationOnce((_id, _ticket, signal) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));
        const view = renderAdmission();
        await start(view);
        await advance(4000);
        const signal = admissionService.status.mock.calls[0][2];
        visibility.mockReturnValue('hidden');
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        await advance(1);
        expect(signal.aborted).toBe(true);
        expect(view.result.current.modalProps.error).toBeNull();
        visibility.mockReturnValue('visible');
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        await advance(1);
        expect(admissionService.status).toHaveBeenCalledTimes(2);
    });

    it('uses server polling cadence and keeps timeout plus error backoff within a short heartbeat', async () => {
        admissionService.join.mockImplementation(() => Promise.resolve(status('WAITING', {
            heartbeatTimeoutSeconds: 30, pollAfterSeconds: 20,
        })));
        admissionService.status.mockImplementationOnce(() => new Promise(() => {}));
        const view = renderAdmission();
        await start(view);
        await advance(9998);
        expect(admissionService.status).not.toHaveBeenCalled();
        await advance(1);
        expect(admissionService.status).toHaveBeenCalledOnce();
        const signal = admissionService.status.mock.calls[0][2];
        await advance(5000);
        expect(signal.aborted).toBe(true);
        expect(view.result.current.modalProps.error).toMatchObject({ admissionPollingTimeout: true });
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: TICKET, requestId: REQUEST });
        await advance(2999);
        expect(admissionService.status).toHaveBeenCalledOnce();
        await advance(1);
        expect(admissionService.status).toHaveBeenCalledTimes(2);
        expect(view.result.current.modalProps.error).toBeNull();
        expect(admissionService.join).toHaveBeenCalledOnce();
    });

    it('retains the admitted content state through countdown ticks and repeated polling', async () => {
        admissionService.join.mockImplementation(() => Promise.resolve(status('ADMITTED')));
        admissionService.status.mockImplementation(() => Promise.resolve(status('ADMITTED', { expiresAt: NOW + 180000 })));
        const seen = [];
        const view = renderHook(() => {
            const value = useReservationAdmission();
            seen.push({ open: value.modalProps.open, state: value.modalProps.status?.state });
            return value;
        });
        views.push(view);
        await start(view);
        const from = seen.length;
        await advance(9000);
        expect(admissionService.status).toHaveBeenCalledTimes(2);
        expect(view.result.current.modalProps.remainingSeconds).toBe(171);
        expect(seen.slice(from).every(value => value.open && value.state === 'ADMITTED')).toBe(true);
    });

    it('uses shared status only after a server join and preserves the tab key and original lease clock', async () => {
        const dispose = vi.fn();
        const read = vi.fn(async () => {
            const observedAt = Date.now() - 1000;
            const shared = status('ADMITTED', { serverTime: observedAt + 60000, expiresAt: observedAt + 240000 });
            delete shared.ticket;
            return { status: shared, observedAt, source: 'remote' };
        });
        const factory = vi.spyOn(admissionPolling, 'createAdmissionPollingCoordinator').mockReturnValue({ read, dispose });
        const view = renderAdmission();
        const { decision } = await start(view);
        const settled = vi.fn(); decision.then(settled);
        expect(admissionService.join).toHaveBeenCalledOnce();
        expect(read).not.toHaveBeenCalled();
        expect(factory).toHaveBeenCalledWith(expect.objectContaining({ owner: { userId: '7', role: 'USER' },
            campaignId: 'sale-1', ticket: TICKET, verifiedStatus: expect.objectContaining({ state: 'WAITING' }) }));
        await advance(4000);
        expect(read).toHaveBeenCalledOnce();
        expect(admissionService.status).not.toHaveBeenCalled();
        expect(view.result.current.modalProps).toMatchObject({ canContinue: true, remainingSeconds: 179 });
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: TICKET, requestId: REQUEST });
        expect(crypto.randomUUID).toHaveBeenCalledOnce();
        expect(settled).not.toHaveBeenCalled();
        expect(admissionService.cancel).not.toHaveBeenCalled();
        act(() => view.result.current.modalProps.onContinue());
        await expect(decision).resolves.toMatchObject({ ticket: TICKET, requestId: REQUEST });
        expect(dispose).toHaveBeenCalledOnce();
    });

    it('verifies a recovered ticket directly before sharing and makes deliberate retries independent', async () => {
        const read = vi.fn(); const dispose = vi.fn();
        vi.spyOn(admissionPolling, 'createAdmissionPollingCoordinator').mockReturnValue({ read, dispose });
        sessionStorage.setItem(KEY, JSON.stringify({ version: 1, owner: { userId: '7', role: 'USER' }, attempts: {
            'sale-1': { campaignId: 'sale-1', ticket: TICKET, requestId: REQUEST, expiresAt: 0 },
        } }));
        const view = renderAdmission();
        await start(view);
        expect(admissionService.status).toHaveBeenCalledOnce();
        expect(admissionService.join).not.toHaveBeenCalled();
        expect(read).not.toHaveBeenCalled();
        act(() => view.result.current.modalProps.onRetry());
        await advance(1);
        expect(admissionService.status).toHaveBeenCalledTimes(2);
        expect(read).not.toHaveBeenCalled();
        expect(metadata().attempts['sale-1'].requestId).toBe(REQUEST);
        expect(crypto.randomUUID).not.toHaveBeenCalled();
    });

    it('aborts shared reads and ignores their late admitted result on a session revision change', async () => {
        let resolveRead;
        const dispose = vi.fn();
        const read = vi.fn(() => new Promise(resolve => { resolveRead = resolve; }));
        vi.spyOn(admissionPolling, 'createAdmissionPollingCoordinator').mockReturnValue({ read, dispose });
        const view = renderAdmission();
        const { decision } = await start(view);
        await advance(4000);
        const signal = read.mock.calls[0][1].signal;
        act(() => useAuthStore.setState({ sessionRevision: 2 }));
        await expect(decision).resolves.toBe(false);
        expect(signal.aborted).toBe(true);
        expect(dispose).toHaveBeenCalledOnce();
        await act(async () => resolveRead({ status: status('ADMITTED'), observedAt: Date.now(), source: 'remote' }));
        expect(view.result.current.modalProps.open).toBe(false);
        expect(sessionStorage.getItem(KEY)).toBeNull();
        expect(admissionService.cancel).not.toHaveBeenCalled();
    });

    it('fails closed on corrupt recovery metadata instead of overwriting it with a new request', async () => {
        sessionStorage.setItem(KEY, '{broken');
        const view = renderAdmission();
        await expect(view.result.current.getPendingAttempt(SCOPE)).rejects.toMatchObject({ admissionStorageError: true });
        const { decision } = await start(view);
        expect(view.result.current.modalProps.error).toMatchObject({ admissionStorageError: true });
        expect(admissionService.join).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(KEY)).toBe('{broken');
        act(() => view.result.current.modalProps.onClose());
        await expect(decision).resolves.toBe(false);
    });

    it('retains a ticket on cancellation failure and removes it only after a successful explicit retry', async () => {
        admissionService.cancel.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
        const view = renderAdmission();
        const { decision } = await start(view);
        const settled = vi.fn(); decision.then(settled);
        act(() => view.result.current.modalProps.onCancel());
        await advance(1);
        expect(view.result.current.modalProps).toMatchObject({ open: true, errorStep: 'cancel' });
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: TICKET, requestId: REQUEST });
        expect(settled).not.toHaveBeenCalled();
        act(() => view.result.current.modalProps.onRetry());
        await advance(1);
        await expect(decision).resolves.toBe(false);
        expect(admissionService.cancel).toHaveBeenCalledTimes(2);
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it.each(['CLAIMED', 'CONSUMED'])('keeps the original key and prevents continuation or cancellation for %s', async state => {
        admissionService.join.mockImplementation(() => Promise.resolve(status(state)));
        admissionService.status.mockImplementation(() => Promise.resolve(status(state)));
        const view = renderAdmission();
        const { decision } = await start(view);
        const settled = vi.fn(); decision.then(settled);
        act(() => { view.result.current.modalProps.onContinue(); view.result.current.modalProps.onCancel(); });
        await advance(12000);
        expect(settled).not.toHaveBeenCalled();
        expect(admissionService.cancel).not.toHaveBeenCalled();
        expect(admissionService.join).toHaveBeenCalledOnce();
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: TICKET, requestId: REQUEST });
        act(() => view.result.current.modalProps.onClose());
        await expect(decision).resolves.toBe(false);
    });

    it('checks lease expiration again at click time without automatically issuing a new request key', async () => {
        admissionService.join.mockResolvedValue(status('ADMITTED', { expiresAt: NOW + 1000 }));
        admissionService.status.mockResolvedValue(status('EXPIRED', { ticket: null }));
        const view = renderAdmission();
        const { decision } = await start(view);
        const settled = vi.fn(); decision.then(settled);
        await advance(1000);
        expect(view.result.current.modalProps.canContinue).toBe(false);
        act(() => view.result.current.modalProps.onContinue());
        await advance(1);
        expect(settled).not.toHaveBeenCalled();
        expect(metadata().attempts['sale-1'].requestId).toBe(REQUEST);
        expect(admissionService.join).toHaveBeenCalledOnce();
    });

    it('replaces a consumed ticket only when the user deliberately starts a new reservation wait', async () => {
        admissionService.join.mockResolvedValueOnce(status('CONSUMED'));
        const view = renderAdmission();
        const { decision } = await start(view);
        const settled = vi.fn(); decision.then(settled);
        await advance(20000);
        expect(admissionService.join).toHaveBeenCalledOnce();
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: TICKET, requestId: REQUEST });
        admissionService.join.mockResolvedValue(status('WAITING', { ticket: NEXT_TICKET }));
        act(() => view.result.current.modalProps.onRetry());
        await advance(1);
        expect(admissionService.join).toHaveBeenCalledTimes(2);
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: NEXT_TICKET, requestId: NEXT_REQUEST });
        expect(admissionService.cancel).not.toHaveBeenCalled();
        expect(settled).not.toHaveBeenCalled();
    });

    it('joins once when admission opens and never retries a full queue automatically', async () => {
        admissionService.find.mockResolvedValue(campaign({ opensAt: new Date(NOW + 10000).toISOString() }));
        admissionService.join.mockResolvedValue(status('FULL', { ticket: null }));
        const view = renderAdmission();
        await start(view);
        expect(view.result.current.modalProps.status.state).toBe('NOT_OPEN');
        await advance(8999);
        expect(admissionService.join).not.toHaveBeenCalled();
        await advance(1000);
        expect(admissionService.join).toHaveBeenCalledOnce();
        expect(view.result.current.modalProps.status.state).toBe('FULL');
        await advance(60000);
        expect(admissionService.join).toHaveBeenCalledOnce();
        act(() => view.result.current.modalProps.onRetry());
        await advance(1);
        expect(admissionService.join).toHaveBeenCalledTimes(2);
    });

    it('creates a new request only after an explicit expired-ticket retry', async () => {
        const first = renderAdmission();
        await start(first);
        const old = metadata().attempts['sale-1'];
        act(() => first.result.current.modalProps.onClose()); first.unmount();
        admissionService.status.mockResolvedValue(status('EXPIRED', { ticket: null }));
        const second = renderAdmission();
        await start(second);
        await advance(20000);
        expect(admissionService.join).toHaveBeenCalledOnce();
        expect(metadata().attempts['sale-1']).toEqual(old);
        admissionService.join.mockResolvedValue(status('ADMITTED', { ticket: NEXT_TICKET }));
        act(() => second.result.current.modalProps.onRetry());
        await advance(1);
        expect(metadata().attempts['sale-1']).toMatchObject({ ticket: NEXT_TICKET, requestId: NEXT_REQUEST });
    });

    it.each([
        { user: null, sessionRevision: 2, isLoggingOut: true },
        { user: { id: 8, role: 'USER' }, sessionRevision: 2 },
        { user: { id: 7, role: 'BUSINESS' }, sessionRevision: 1 },
        { user: { id: 7, role: 'USER' }, sessionRevision: 2 },
    ])('discards a late response and metadata after a live identity change %#', async auth => {
        let finish;
        admissionService.join.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const view = renderAdmission();
        const { decision } = await start(view);
        const staleEnter = view.result.current.enter;
        const signal = admissionService.join.mock.calls[0][1];
        act(() => useAuthStore.setState(auth));
        await expect(decision).resolves.toBe(false);
        expect(signal.aborted).toBe(true);
        expect(sessionStorage.getItem(KEY)).toBeNull();
        await act(async () => finish(status('ADMITTED')));
        expect(sessionStorage.getItem(KEY)).toBeNull();
        expect(view.result.current.modalProps.open).toBe(false);
        await expect(staleEnter(SCOPE)).rejects.toMatchObject({ name: 'AbortError' });
    });
});
