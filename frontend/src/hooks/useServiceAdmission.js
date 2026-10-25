import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import service from '../services/serviceAdmissionService';
import useAuthStore from '../store/useAuthStore';
import { currentSession, isCurrentSession } from '../api/sessionScope';
import { subscribeServiceAdmission, completeServiceAdmission, cancelServiceAdmission } from '../api/serviceAdmissionGate';
import { admissionPollingTiming, createAdmissionPollingCoordinator, readAdmissionStatus } from '../utils/admissionPollingCoordinator';
import { serviceEntryStatus } from '../utils/serviceAdmissionStatus';
export { serviceEntryStatus } from '../utils/serviceAdmissionStatus';

const initial = { open: false, busy: false, status: null, error: null };
const live = status => ['WAITING', 'ADMITTED'].includes(status?.state);
const visible = () => globalThis.document?.visibilityState !== 'hidden';
const abortError = () => new DOMException('입장 확인을 중단했어요.', 'AbortError');
const identityOf = state => `${state.user?.id ?? 'anonymous'}:${state.user?.role ?? ''}:${state.sessionRevision}`;
const shouldPoll = (status, workActive) => status?.state === 'WAITING'
    || status?.state === 'ADMITTED' && (status.mode === 'EMERGENCY' || status.mode === 'CORE' && workActive);

/* 계정 세션마다 처리기 하나를 두고 입장 중에도 페이지 내용을 유지한다. */
export function createServiceAdmissionFlow(onChange, { entryAllowed = true } = {}) {
    const session = currentSession();
    const identity = identityOf(useAuthStore.getState());
    const user = useAuthStore.getState().user;
    const owner = user?.id != null ? { userId: String(user.id), role: user.role } : `epoch:${session.epoch}`;
    let mounted = false;
    let view = initial;
    let currentStatus = null;
    let generation = 0;
    let timer;
    let request;
    let actionInFlight;
    let resumeAction;
    let coordinator;
    let unsubscribe;
    let requested = false;
    let pendingNeeded = false;
    let workActive = false;
    let failures = 0;
    const sameOwner = () => isCurrentSession(session.epoch) && identityOf(useAuthStore.getState()) === identity;
    const current = run => mounted && sameOwner() && generation === run;
    const emit = patch => {
        if (!mounted || !sameOwner()) return;
        view = { ...view, ...patch };
        onChange(view);
    };
    const stop = () => { clearTimeout(timer); request?.abort(); request = null; };
    const clearCoordinator = () => { coordinator?.dispose(); coordinator = null; };
    const fetchStatus = signal => service.status(signal).then(serviceEntryStatus);
    const schedule = (observedAt = Date.now()) => {
        clearTimeout(timer);
        if (!entryAllowed || !visible() || !shouldPoll(currentStatus, workActive) || !sameOwner()) return;
        const timing = admissionPollingTiming(currentStatus);
        const delay = failures ? Math.min(timing.retryCapMs, timing.intervalMs * 2 ** Math.min(failures, 3))
            : Math.min(timing.heartbeatTimeoutSeconds * 1000 / 3, timing.intervalMs + Math.random() * 500);
        timer = setTimeout(() => void perform('poll'), Math.max(100, observedAt + delay - Date.now()));
    };
    const accept = (status, observedAt = Date.now(), source = 'server', open = view.open) => {
        const previous = currentStatus;
        currentStatus = status;
        failures = 0;
        if (status.continuityId !== previous?.continuityId || !coordinator) {
            clearCoordinator();
            if (live(status) && source === 'server') coordinator = createAdmissionPollingCoordinator({ owner, campaignId: 'service-entry',
                ticket: status.continuityId, verifiedStatus: status, isCurrent: () => mounted && sameOwner(), isVisible: visible });
        }
        if (!live(status)) clearCoordinator();
        if (status.state === 'ADMITTED' || status.state === 'BYPASS') {
            requested = false;
            completeServiceAdmission(session.epoch);
        }
        emit({ status, busy: false, error: null, open });
        schedule(observedAt);
    };
    const join = async signal => {
        const verifiedJoin = async () => {
            if (signal.aborted || !sameOwner()) throw abortError();
            const existing = await fetchStatus(signal);
            if (signal.aborted || !sameOwner()) throw abortError();
            if (live(existing) || existing.state === 'BYPASS') return existing;
            return serviceEntryStatus(await service.join(signal));
        };
        // 첫 쿠키 생성만 별도 잠금을 사용하고 주기 조회는 공유 조정기를 사용한다.
        if (!globalThis.navigator?.locks?.request) return verifiedJoin();
        let entered = false;
        try {
            return await navigator.locks.request('reserve-service-entry-join', { signal }, () => {
                entered = true;
                return verifiedJoin();
            });
        } catch (error) {
            if (entered || signal.aborted || ['AbortError', 'TimeoutError'].includes(error?.name)
                || error?.admissionPollingTimeout || !sameOwner()) throw error;
            return verifiedJoin();
        }
    };
    async function perform(action) {
        if (!entryAllowed || !mounted || !sameOwner()) return;
        if (!visible()) { resumeAction = action === 'restore' ? 'restore' : 'verify'; emit({ busy: false }); return; }
        const run = ++generation;
        stop();
        request = new AbortController();
        actionInFlight = action;
        const signal = AbortSignal.any([request.signal, session.signal]);
        if (action !== 'poll' && action !== 'restore') emit({ busy: true, error: null });
        try {
            let result;
            if (action === 'cancel') {
                result = await readAdmissionStatus(signal => service.cancel(signal).then(serviceEntryStatus), { signal });
                if (!current(run)) throw abortError();
                requested = false;
                pendingNeeded = false;
                clearCoordinator();
                cancelServiceAdmission(session.epoch);
            } else if (action === 'join') {
                pendingNeeded = false;
                result = await readAdmissionStatus(join, { signal, ...currentStatus });
            } else {
                result = action === 'poll' && coordinator
                    ? await coordinator.read(fetchStatus, { signal, ...currentStatus })
                    : await readAdmissionStatus(fetchStatus, { signal, ...currentStatus });
                if (!current(run)) throw abortError();
                const status = serviceEntryStatus(result.status);
                const newWork = pendingNeeded;
                pendingNeeded = false;
                if (['NOT_JOINED', 'EXPIRED', 'CANCELLED'].includes(status.state)
                    && (newWork || action === 'restore' && status.mode === 'EMERGENCY' && status.state === 'NOT_JOINED')) {
                    result = await readAdmissionStatus(join, { signal, ...status });
                }
            }
            if (!current(run)) return;
            const status = serviceEntryStatus(result.status);
            const open = action === 'restore' && !requested
                ? status.state === 'WAITING' || status.mode === 'EMERGENCY' && !['BYPASS', 'ADMITTED'].includes(status.state)
                : view.open;
            accept(status, result.observedAt, result.source, open);
        } catch (error) {
            if (!current(run) || signal.aborted) return;
            failures += 1;
            // 선택적 입장 기능의 초기 오류로 일반 페이지 탐색을 막지 않는다.
            if (action !== 'restore' || requested) emit({ busy: false, error });
            else emit({ busy: false });
            schedule();
        } finally {
            if (current(run)) { request = null; actionInFlight = null; }
        }
    }
    const needed = () => {
        if (!mounted || !sameOwner()) return;
        requested = true;
        pendingNeeded = true;
        if (!entryAllowed) return;
        emit({ open: true, busy: Boolean(request), error: null });
        if (!request) void perform('needed');
    };
    const visibilityChanged = () => {
        if (!visible()) {
            if (request) resumeAction = actionInFlight === 'restore' ? 'restore' : actionInFlight === 'poll' ? 'poll' : 'verify';
            ++generation;
            stop();
            emit({ busy: false });
        } else {
            const action = pendingNeeded ? 'needed' : resumeAction || (shouldPoll(currentStatus, workActive) ? 'poll' : null);
            resumeAction = null;
            if (action) void perform(action);
        }
    };
    const sessionAborted = () => {
        ++generation; stop(); clearCoordinator();
        if (mounted) { view = initial; onChange(view); }
    };
    return {
        mount() {
            mounted = true;
            unsubscribe = subscribeServiceAdmission(session.epoch, needed);
            document.addEventListener('visibilitychange', visibilityChanged);
            session.signal.addEventListener('abort', sessionAborted, { once: true });
            if (entryAllowed && !request) void perform('restore');
        },
        dispose() {
            mounted = false; ++generation; stop(); clearCoordinator(); unsubscribe?.();
            document.removeEventListener('visibilitychange', visibilityChanged);
            session.signal.removeEventListener('abort', sessionAborted);
        },
        close() { emit({ open: false }); },
        setWorkActive(value) {
            if (workActive === Boolean(value)) return;
            workActive = Boolean(value);
            if (!entryAllowed || !mounted || currentStatus?.state !== 'ADMITTED' || currentStatus.mode !== 'CORE') return;
            if (!workActive) {
                clearTimeout(timer);
                if (actionInFlight === 'poll') { ++generation; stop(); emit({ busy: false }); }
                if (resumeAction === 'poll') resumeAction = null;
            } else if (visible() && !request) void perform('verify');
        },
        retry() {
            if (request) return;
            requested = true; pendingNeeded = true;
            emit({ open: true });
            void perform(['EXPIRED', 'CANCELLED', 'FULL', 'NOT_JOINED'].includes(currentStatus?.state) ? 'join' : 'needed');
        },
        cancel() { if (live(currentStatus) && !['join', 'cancel'].includes(actionInFlight)) void perform('cancel'); },
    };
}

export default function useServiceAdmission({ workActive = false, entryAllowed = true } = {}) {
    const identity = useAuthStore(identityOf);
    const scope = `${identity}:${entryAllowed}`;
    const [scopedView, setScopedView] = useState({ scope, view: initial });
    const flow = useRef(null);
    useLayoutEffect(() => {
        const next = createServiceAdmissionFlow(view => setScopedView({ scope: `${identity}:${entryAllowed}`, view }), { entryAllowed });
        flow.current = next;
        next.mount();
        return () => { next.dispose(); if (flow.current === next) flow.current = null; };
    }, [identity, entryAllowed]);
    useLayoutEffect(() => { flow.current?.setWorkActive(workActive); }, [identity, entryAllowed, workActive]);
    const close = useCallback(() => flow.current?.close(), []);
    const retry = useCallback(() => flow.current?.retry(), []);
    const cancel = useCallback(() => flow.current?.cancel(), []);
    const view = scopedView.scope === scope ? scopedView.view : initial;
    return { ...view, close, retry, cancel };
}
