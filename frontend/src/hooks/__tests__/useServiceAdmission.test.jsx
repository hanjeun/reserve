import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useServiceAdmission, { serviceEntryStatus } from '../useServiceAdmission';
import useAuthStore from '../../store/useAuthStore';
import service from '../../services/serviceAdmissionService';
import { advanceSession, currentSession } from '../../api/sessionScope';
import { subscribeServiceAdmission, completeServiceAdmission, cancelServiceAdmission } from '../../api/serviceAdmissionGate';
import * as polling from '../../utils/admissionPollingCoordinator';

vi.mock('../../store/useAuthStore', async () => {
    const { create } = await import('zustand');
    return { default: create(() => ({ user: null, sessionRevision: 0 })) };
});
vi.mock('../../services/serviceAdmissionService', () => ({ default: { status: vi.fn(), join: vi.fn(), cancel: vi.fn() } }));
vi.mock('../../api/serviceAdmissionGate', () => ({ subscribeServiceAdmission: vi.fn(), completeServiceAdmission: vi.fn(), cancelServiceAdmission: vi.fn() }));

const NOW = Date.parse('2026-10-23T00:00:00Z');
const CONTINUITY = 'a'.repeat(64);
const status = (state, changes = {}) => ({ campaignId: 'service-entry', mode: 'CORE', state,
    position: state === 'WAITING' ? 3 : 0, expiresAt: state === 'ADMITTED' ? Date.now() + 900000 : 0,
    absoluteExpiresAt: state === 'ADMITTED' ? NOW + 7200000 : 0, serverTime: Date.now(),
    heartbeatTimeoutSeconds: state === 'ADMITTED' ? 900 : 90, pollAfterSeconds: state === 'ADMITTED' ? 60 : 4,
    continuityId: ['WAITING', 'ADMITTED'].includes(state) ? CONTINUITY : null, ...changes });
const advance = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const views = [];
let listeners;
const needed = () => act(() => { listeners.forEach(listener => listener({ code: 'SERVICE_ADMISSION_REQUIRED' })); });
const renderAdmission = (workActive, entryAllowed = true) => {
    const view = renderHook(props => useServiceAdmission(props), { initialProps: { workActive: Boolean(workActive), entryAllowed } });
    views.push(view); return view;
};

describe('service admission intent, lifecycle, and account boundary', () => {
    beforeEach(() => {
        vi.useFakeTimers(); vi.setSystemTime(NOW);
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        advanceSession();
        useAuthStore.setState({ user: { id: 7, role: 'USER' }, sessionRevision: currentSession().epoch });
        listeners = new Set();
        subscribeServiceAdmission.mockReset().mockImplementation((_epoch, listener) => {
            listeners.add(listener); return () => listeners.delete(listener);
        });
        completeServiceAdmission.mockReset(); cancelServiceAdmission.mockReset();
        Object.values(service).forEach(mock => mock.mockReset());
        service.status.mockImplementation(() => Promise.resolve(status('NOT_JOINED')));
        service.join.mockImplementation(() => Promise.resolve(status('WAITING')));
        service.cancel.mockImplementation(() => Promise.resolve(status('CANCELLED')));
    });
    afterEach(() => {
        views.splice(0).forEach(view => view.unmount());
        vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
    });

    it('keeps CORE bootstrap quiet and joins exactly once for a gate received during restore', async () => {
        let resolveRestore;
        service.status.mockImplementationOnce(() => new Promise(resolve => { resolveRestore = resolve; }));
        const view = renderAdmission(); await advance(1);
        expect(view.result.current.open).toBe(false);
        needed();
        expect(view.result.current).toMatchObject({ open: true, busy: true });
        await act(async () => resolveRestore(status('NOT_JOINED')));
        await advance(1);
        expect(service.join).toHaveBeenCalledOnce();
        expect(view.result.current).toMatchObject({ open: true, busy: false, status: { state: 'WAITING' } });
        await advance(4000);
        expect(service.join).toHaveBeenCalledOnce();
    });

    it.each(['CORE', 'EMERGENCY'])('restores an admitted %s cookie without reopening the modal', async mode => {
        service.status.mockImplementation(() => Promise.resolve(status('ADMITTED', { mode })));
        const view = renderAdmission(); await advance(1);
        expect(view.result.current).toMatchObject({ open: false, busy: false, status: { state: 'ADMITTED' } });
        expect(service.join).not.toHaveBeenCalled();
        expect(completeServiceAdmission).toHaveBeenCalledWith(currentSession().epoch);
        await advance(60000);
        expect(service.status).toHaveBeenCalledTimes(mode === 'CORE' ? 1 : 2);
        expect(view.result.current.open).toBe(false);
    });

    it('does not join or poll on a preserved transaction page and verifies the existing pass when browsing resumes', async () => {
        service.status.mockImplementation(() => Promise.resolve(status('ADMITTED', { mode: 'EMERGENCY' })));
        const view = renderAdmission(false, false);
        await advance(60000);
        needed(); await advance(1);
        expect(service.status).not.toHaveBeenCalled();
        expect(service.join).not.toHaveBeenCalled();
        expect(view.result.current.open).toBe(false);
        view.rerender({ workActive: true, entryAllowed: true });
        await advance(1);
        expect(service.status).toHaveBeenCalledOnce();
        expect(view.result.current.status.state).toBe('ADMITTED');
        expect(view.result.current.open).toBe(false);
        expect(service.join).not.toHaveBeenCalled();
        expect(service.cancel).not.toHaveBeenCalled();
    });

    it.each(['EXPIRED', 'CANCELLED'])('does not rejoin %s on F5 or visibility changes, but accepts new deliberate work', async state => {
        service.status.mockImplementation(() => Promise.resolve(status(state, { mode: 'EMERGENCY' })));
        const view = renderAdmission(); await advance(1);
        expect(view.result.current.status.state).toBe(state);
        await advance(60000);
        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        visibility.mockReturnValue('hidden'); act(() => document.dispatchEvent(new Event('visibilitychange')));
        visibility.mockReturnValue('visible'); act(() => document.dispatchEvent(new Event('visibilitychange')));
        await advance(1);
        expect(service.join).not.toHaveBeenCalled();
        needed(); await advance(1);
        expect(service.join).toHaveBeenCalledOnce();
        expect(view.result.current.status.state).toBe('WAITING');
    });

    it('joins a fresh EMERGENCY visitor but requires explicit retry after a live ticket expires', async () => {
        service.status.mockImplementation(() => Promise.resolve(status('NOT_JOINED', { mode: 'EMERGENCY' })));
        const view = renderAdmission(); await advance(1);
        expect(service.join).toHaveBeenCalledOnce();
        service.status.mockImplementation(() => Promise.resolve(status('EXPIRED', { mode: 'EMERGENCY' })));
        await advance(4000); await advance(60000);
        expect(view.result.current.status.state).toBe('EXPIRED');
        expect(service.join).toHaveBeenCalledOnce();
        act(() => view.result.current.retry()); await advance(1);
        expect(service.join).toHaveBeenCalledTimes(2);
    });

    it('clears busy on hidden abort and resumes an unfinished initial lookup when visible', async () => {
        let resolveOld;
        service.status.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
        const view = renderAdmission(); await advance(1); needed();
        const initialSignal = service.status.mock.calls[0][0];
        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        visibility.mockReturnValue('hidden'); act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(initialSignal.aborted).toBe(true);
        expect(view.result.current.busy).toBe(false);
        await advance(10000);
        expect(service.status).toHaveBeenCalledOnce();
        visibility.mockReturnValue('visible'); act(() => document.dispatchEvent(new Event('visibilitychange')));
        await advance(1);
        expect(service.join).toHaveBeenCalledOnce();
        expect(view.result.current.status.state).toBe('WAITING');
        await act(async () => resolveOld(status('ADMITTED')));
        expect(view.result.current.status.state).toBe('WAITING');
    });

    it('defers hidden bootstrap and keeps disabled-backend failures quiet until actual work is blocked', async () => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        const failure = Object.assign(new Error('unavailable'), { status: 503 });
        service.status.mockRejectedValue(failure);
        const view = renderAdmission(); await advance(1000);
        expect(service.status).not.toHaveBeenCalled();
        visibility.mockReturnValue('visible'); act(() => document.dispatchEvent(new Event('visibilitychange')));
        await advance(1);
        expect(view.result.current).toMatchObject({ open: false, busy: false, error: null });
        needed(); await advance(1);
        expect(view.result.current).toMatchObject({ open: true, busy: false, error: failure });
        expect(service.join).not.toHaveBeenCalled();
    });

    it('aborts a previous account and discards its late reply while restoring the new account', async () => {
        let resolveOld;
        service.status.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
        const view = renderAdmission(); await advance(1); needed();
        const oldSignal = service.status.mock.calls[0][0];
        act(() => {
            advanceSession();
            useAuthStore.setState({ user: { id: 8, role: 'BUSINESS' }, sessionRevision: currentSession().epoch });
        });
        await advance(1);
        expect(oldSignal.aborted).toBe(true);
        expect(view.result.current).toMatchObject({ open: false, status: { state: 'NOT_JOINED' } });
        await act(async () => resolveOld(status('ADMITTED')));
        expect(completeServiceAdmission).not.toHaveBeenCalled();
        expect(view.result.current.status.state).toBe('NOT_JOINED');
        expect(listeners.size).toBe(1);
    });

    it('shares only periodic verified status, keeps retries direct, and stops the coordinator on logout', async () => {
        service.status.mockImplementation(() => Promise.resolve(status('WAITING')));
        const read = vi.fn(async () => ({ status: status('ADMITTED', { mode: 'EMERGENCY' }), observedAt: Date.now(), source: 'remote' }));
        const dispose = vi.fn();
        const factory = vi.spyOn(polling, 'createAdmissionPollingCoordinator').mockReturnValue({ read, dispose });
        const view = renderAdmission(); await advance(1);
        expect(read).not.toHaveBeenCalled();
        expect(factory).toHaveBeenCalledWith(expect.objectContaining({ owner: { userId: '7', role: 'USER' }, ticket: CONTINUITY,
            verifiedStatus: expect.objectContaining({ state: 'WAITING' }) }));
        await advance(4000);
        expect(read).toHaveBeenCalledOnce();
        expect(service.status).toHaveBeenCalledOnce();
        expect(view.result.current.status.state).toBe('ADMITTED');
        act(() => view.result.current.retry()); await advance(1);
        expect(service.status).toHaveBeenCalledTimes(2);
        expect(read).toHaveBeenCalledOnce();
        act(() => { advanceSession(); useAuthStore.setState({ user: null, sessionRevision: currentSession().epoch }); });
        await advance(1);
        expect(dispose).toHaveBeenCalled();
        expect(service.join).not.toHaveBeenCalled();
        expect(service.cancel).not.toHaveBeenCalled();
    });

    it('bounds queued join locks and prevents their late callback from sending a POST after abort', async () => {
        let enterLock;
        vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, _options, callback) => new Promise(resolve => {
            enterLock = () => resolve(callback());
        })) } });
        const view = renderAdmission(); await advance(1); needed(); await advance(1);
        await advance(10000);
        expect(view.result.current.error).toMatchObject({ admissionPollingTimeout: true });
        expect(service.join).not.toHaveBeenCalled();
        await act(async () => { enterLock(); });
        expect(service.join).not.toHaveBeenCalled();
        expect(service.status).toHaveBeenCalledTimes(2);
    });

    it('falls back from an unavailable join lock but never repeats an acquired failed POST', async () => {
        const lock = vi.fn().mockRejectedValue(new DOMException('unavailable', 'NotSupportedError'));
        vi.stubGlobal('navigator', { locks: { request: lock } });
        const view = renderAdmission(); await advance(1); needed(); await advance(1);
        expect(service.join).toHaveBeenCalledOnce();
        expect(view.result.current.status.state).toBe('WAITING');
        view.unmount();
        lock.mockImplementation((_name, _options, callback) => callback());
        service.status.mockImplementation(() => Promise.resolve(status('EXPIRED')));
        const failure = Object.assign(new Error('unknown join response'), { status: 503 });
        service.join.mockRejectedValue(failure);
        const next = renderAdmission(); await advance(1); needed(); await advance(1);
        expect(service.join).toHaveBeenCalledTimes(2);
        expect(next.result.current).toMatchObject({ busy: false, error: failure });
        await advance(60000);
        expect(service.join).toHaveBeenCalledTimes(2);
    });

    it('does not fall back to a POST after the lock itself aborts', async () => {
        vi.stubGlobal('navigator', { locks: { request: vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')) } });
        const view = renderAdmission(); await advance(1); needed(); await advance(1);
        expect(service.join).not.toHaveBeenCalled();
        expect(view.result.current).toMatchObject({ busy: false, error: { name: 'AbortError' } });
    });

    it('bounds an unknown join response and treats close and explicit cancel as different actions', async () => {
        service.join.mockImplementationOnce(() => new Promise(() => {}));
        const view = renderAdmission(); await advance(1); needed(); await advance(1);
        const signal = service.join.mock.calls[0][0];
        await advance(10000);
        expect(signal.aborted).toBe(true);
        expect(view.result.current).toMatchObject({ busy: false, error: { admissionPollingTimeout: true } });
        service.status.mockImplementation(() => Promise.resolve(status('WAITING')));
        act(() => view.result.current.retry()); await advance(1);
        act(() => view.result.current.close());
        expect(service.cancel).not.toHaveBeenCalled();
        needed(); await advance(1);
        act(() => view.result.current.cancel()); await advance(1);
        expect(service.cancel).toHaveBeenCalledOnce();
        expect(cancelServiceAdmission).toHaveBeenCalledWith(currentSession().epoch);
        await advance(60000);
        expect(service.join).toHaveBeenCalledOnce();
    });

    it('keeps a visible CORE form lease alive and stops its keepalive after leaving the form', async () => {
        service.status.mockImplementation(() => Promise.resolve(status('ADMITTED')));
        const view = renderAdmission(true); await advance(1);
        expect(view.result.current.open).toBe(false);
        await advance(16 * 60000);
        expect(service.status).toHaveBeenCalledTimes(17);
        expect(view.result.current.status.state).toBe('ADMITTED');
        view.rerender({ workActive: false });
        await advance(120000);
        expect(service.status).toHaveBeenCalledTimes(17);
        view.rerender({ workActive: true }); await advance(1);
        expect(service.status).toHaveBeenCalledTimes(18);
        expect(service.join).not.toHaveBeenCalled();
    });

    it('pauses CORE form keepalive while hidden and never rejoins automatically at the hard deadline', async () => {
        service.status.mockImplementation(() => Promise.resolve(status('ADMITTED')));
        const view = renderAdmission(true); await advance(1);
        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        visibility.mockReturnValue('hidden'); act(() => document.dispatchEvent(new Event('visibilitychange')));
        await advance(120000);
        expect(service.status).toHaveBeenCalledOnce();
        service.status.mockImplementation(() => Promise.resolve(status('EXPIRED')));
        visibility.mockReturnValue('visible'); act(() => document.dispatchEvent(new Event('visibilitychange')));
        await advance(1); await advance(60000);
        expect(view.result.current.status.state).toBe('EXPIRED');
        expect(service.join).not.toHaveBeenCalled();
        expect(view.result.current.open).toBe(false);
    });

    it('rejects invalid continuity and strips arbitrary status data before sharing', () => {
        expect(() => serviceEntryStatus(status('WAITING', { continuityId: null }))).toThrow();
        expect(() => serviceEntryStatus(status('BYPASS', { continuityId: { capability: 'private' } }))).toThrow();
        expect(() => serviceEntryStatus(status('ADMITTED', { absoluteExpiresAt: NOW }))).toThrow();
        expect(serviceEntryStatus(status('WAITING', { token: 'private', cookie: 'private' }))).toEqual(status('WAITING'));
    });
});
