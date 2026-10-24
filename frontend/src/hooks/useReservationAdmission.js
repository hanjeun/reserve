import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import admissionService from '../services/admissionService';
import { newReservationRequestId } from '../utils/reservationRequest';
import { admissionPollingTiming, createAdmissionPollingCoordinator, readAdmissionStatus } from '../utils/admissionPollingCoordinator';

const STORAGE_KEY = 'reserve-admission-attempts-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CAMPAIGN_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const STATES = new Set(['WAITING', 'ADMITTED', 'CLAIMED', 'CONSUMED', 'EXPIRED', 'CANCELLED', 'NOT_OPEN', 'CLOSED', 'FULL']);
const LIVE_STATES = new Set(['WAITING', 'ADMITTED', 'CLAIMED']);
const EMPTY_VIEW = { open: false, busy: false, campaign: null, status: null, attempt: null,
    error: null, errorStep: null, serverOffset: 0, now: 0 };
const sessionIdentity = state => `${state.user?.id ?? 'anonymous'}:${state.user?.role ?? ''}:${state.sessionRevision}`;
const ownerOf = state => state.user?.id != null ? { userId: String(state.user.id), role: state.user.role } : null;
const abortError = () => new DOMException('예약 입장 확인을 중단했어요.', 'AbortError');
const storageError = () => Object.assign(new Error('이전 입장 정보를 확인하지 못했어요. 예약 내역을 먼저 확인한 뒤 다시 시도해주세요.'), { admissionStorageError: true });
const protocolError = message => Object.assign(new Error(message), { admissionProtocolError: true });

function readMetadata(owner) {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return { owner, attempts: {} };
        const value = JSON.parse(raw);
        if (value?.version !== 1 || !value.owner || !value.attempts || typeof value.attempts !== 'object') throw storageError();
        if (value.owner.userId !== owner.userId || value.owner.role !== owner.role) {
            sessionStorage.removeItem(STORAGE_KEY);
            return { owner, attempts: {} };
        }
        const attempts = {};
        for (const [id, record] of Object.entries(value.attempts)) {
            if (!CAMPAIGN_ID.test(id) || record?.campaignId !== id || !UUID.test(record.requestId)
                || record.ticket !== null && !UUID.test(record.ticket)
                || !Number.isSafeInteger(record.expiresAt) || record.expiresAt < 0) throw storageError();
            attempts[id] = { campaignId: id, ticket: record.ticket, requestId: record.requestId, expiresAt: record.expiresAt };
        }
        return { owner, attempts };
    } catch { throw storageError(); }
}

function saveMetadata(owner, attempt) {
    const metadata = readMetadata(owner);
    metadata.attempts[attempt.campaignId] = attempt;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...metadata })); }
    catch { throw storageError(); }
}

function forgetMetadata(owner, attempt) {
    const metadata = readMetadata(owner);
    const saved = metadata.attempts[attempt?.campaignId];
    if (!saved || saved.requestId !== attempt.requestId || saved.ticket !== attempt.ticket) return;
    delete metadata.attempts[attempt.campaignId];
    try {
        if (Object.keys(metadata.attempts).length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...metadata }));
        else sessionStorage.removeItem(STORAGE_KEY);
    } catch { throw storageError(); }
}

function scopeKey(scope) {
    if (!Number.isSafeInteger(Number(scope?.storeId)) || Number(scope.storeId) < 1
        || !/^\d{4}-\d{2}-\d{2}$/.test(scope.date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(scope.time)) {
        throw new Error('예약 날짜와 시간을 다시 확인해주세요.');
    }
    return `${scope.storeId}:${scope.date}:${scope.time.length === 5 ? `${scope.time}:00` : scope.time}`;
}

function campaignOf(value) {
    if (value === null) return null;
    if (!value || !CAMPAIGN_ID.test(value.id) || !Number.isFinite(Date.parse(value.opensAt))
        || !Number.isFinite(Date.parse(value.closesAt)) || Date.parse(value.closesAt) <= Date.parse(value.opensAt)
        || !Number.isFinite(value.leaseSeconds) || value.leaseSeconds <= 0) throw protocolError('입장 대기 설정을 확인하지 못했어요.');
    return { id: value.id, opensAt: value.opensAt, closesAt: value.closesAt, leaseSeconds: value.leaseSeconds };
}

function statusOf(value, campaign) {
    const ticket = value?.ticket || null;
    if (!value || value.campaignId !== campaign.id || !STATES.has(value.state)
        || ticket !== null && !UUID.test(ticket)
        || !Number.isSafeInteger(value.position) || value.position < 0
        || !Number.isSafeInteger(value.expiresAt) || value.expiresAt < 0
        || !Number.isSafeInteger(value.serverTime) || value.serverTime < 0
        || ['WAITING', 'ADMITTED', 'CLAIMED', 'CONSUMED'].includes(value.state) && !ticket
        || value.state === 'ADMITTED' && value.expiresAt <= 0
        || value.state === 'WAITING' && value.position < 1) throw protocolError('입장 상태를 확인하지 못했어요.');
    const heartbeat = Number(value.heartbeatTimeoutSeconds);
    const timing = admissionPollingTiming({ ...value,
        heartbeatTimeoutSeconds: Number.isFinite(heartbeat) && heartbeat >= 30 && heartbeat <= 300 ? heartbeat : 90 });
    return { ...value, ticket, heartbeatTimeoutSeconds: timing.heartbeatTimeoutSeconds, pollAfterSeconds: timing.pollAfterSeconds };
}

// Runtime revisions restart on F5. Only the first /me restoration may reuse stable owner metadata.
let initialOwnerRestore = !ownerOf(useAuthStore.getState()) && !useAuthStore.getState().isLoggingOut;
const unsubscribe = useAuthStore.subscribe((state, previous) => {
    if (sessionIdentity(state) !== sessionIdentity(previous)) {
        const restoring = initialOwnerRestore && !ownerOf(previous) && ownerOf(state)
            && previous.authRestoring === true && state.authRestoring === true;
        initialOwnerRestore = false;
        if (restoring) {
            // readMetadata removes a different saved owner; unreadable recovery data must remain fail-closed.
            try { readMetadata(ownerOf(state)); } catch { /* The caller will require recovery before a new request. */ }
        } else {
            try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Reads remain fail-closed if storage is unavailable. */ }
        }
    } else if (previous.authRestoring && !state.authRestoring) initialOwnerRestore = false;
});
import.meta.hot?.dispose(unsubscribe);

/** One pending decision; all late network responses must pass this controller's session/run boundary. */
function createAdmissionFlow(onChange) {
    let mounted = false;
    let identity = sessionIdentity(useAuthStore.getState());
    let active = null;
    let lookupCache = null;
    const lookups = new Set();
    const current = run => mounted && active === run && run.identity === sessionIdentity(useAuthStore.getState());
    const emit = (run, patch) => { if (current(run)) onChange(previous => current(run) ? { ...previous, ...patch } : previous); };
    const clearTimer = run => { clearTimeout(run.timer); run.timer = null; };
    const assertIdentity = expected => {
        if (!mounted || !ownerOf(useAuthStore.getState()) || identity !== expected
            || expected !== sessionIdentity(useAuthStore.getState())) throw abortError();
    };
    const finish = (run, result) => {
        if (active !== run) return;
        active = null;
        clearTimer(run);
        run.controller?.abort();
        run.poller?.dispose();
        onChange(previous => ({ ...previous, open: false, busy: false }));
        run.resolve(result);
    };

    async function lookup(scope, expected, signal, force = false) {
        const key = scopeKey(scope);
        if (!force && lookupCache?.identity === expected && lookupCache.key === key && lookupCache.until > Date.now()) return lookupCache.campaign;
        const campaign = campaignOf(await admissionService.find(scope, signal));
        assertIdentity(expected);
        if (signal.aborted) throw abortError();
        lookupCache = { key, identity: expected, campaign, until: Date.now() + 3000 };
        return campaign;
    }

    function schedule(run, step, delay) {
        clearTimer(run);
        run.next = { step, at: Date.now() + Math.max(0, delay) };
        if (document.visibilityState === 'hidden' || !current(run)) return;
        run.timer = setTimeout(() => {
            run.timer = null;
            if (run.next.at > Date.now()) schedule(run, step, run.next.at - Date.now());
            else void request(run, step, step === 'status');
        }, Math.min(Math.max(0, delay), 2147483647));
    }

    function applyStatus(run, value, step, observedAt = Date.now(), source = 'server') {
        const status = statusOf(value, run.campaign);
        if (status.ticket) {
            if (run.attempt?.ticket && run.attempt.ticket !== status.ticket) throw protocolError('입장권이 변경됐어요. 기존 예약 요청을 먼저 확인해주세요.');
            run.attempt = { campaignId: run.campaign.id, ticket: status.ticket,
                requestId: run.attempt?.requestId || newReservationRequestId(), expiresAt: status.expiresAt || run.attempt?.expiresAt || 0 };
            saveMetadata(run.owner, run.attempt);
        }
        run.status = status;
        run.serverOffset = status.serverTime > 0 ? status.serverTime - observedAt : run.serverOffset;
        run.failures = 0;
        run.failedStep = null;
        emit(run, { campaign: run.campaign, status, attempt: run.attempt, error: null, errorStep: null,
            serverOffset: run.serverOffset, now: Date.now() });
        if (step === 'cancel' && ['CANCELLED', 'EXPIRED'].includes(status.state)) {
            if (run.attempt) forgetMetadata(run.owner, run.attempt);
            finish(run, false);
            return;
        }
        if (LIVE_STATES.has(status.state)) {
            if (!run.poller && source === 'server') {
                run.poller = createAdmissionPollingCoordinator({ owner: run.owner, campaignId: run.campaign.id,
                    ticket: run.attempt.ticket, verifiedStatus: status, isCurrent: () => current(run),
                    isVisible: () => document.visibilityState !== 'hidden' });
            }
            const timing = admissionPollingTiming(status);
            const delay = Math.min(timing.heartbeatTimeoutSeconds * 1000 / 3, timing.intervalMs + Math.random() * 500);
            // A shared response keeps its original observation time; receipt must not extend the lease or heartbeat.
            schedule(run, 'status', Math.max(0, observedAt + delay - Date.now()));
        }
        else if (status.state === 'NOT_OPEN') {
            const untilOpen = Date.parse(run.campaign.opensAt) - (Date.now() + run.serverOffset);
            // A missing server clock must not turn a skewed local clock into a tight POST loop.
            schedule(run, 'join', untilOpen > 0 ? untilOpen : 15000);
        }
        else {
            run.next = null; // FULL/terminal outcomes require a deliberate action, never an automatic new ticket.
            run.poller?.dispose(); run.poller = null;
        }
    }

    async function request(run, step, periodic = false) {
        if (!current(run) || run.inFlight || document.visibilityState === 'hidden' && step === 'status') return;
        clearTimer(run);
        run.next = null;
        run.inFlight = true;
        run.step = step;
        run.controller = new AbortController();
        emit(run, { busy: true, error: null, errorStep: null });
        try {
            if (step === 'lookup') {
                run.campaign = await lookup(run.scope, run.identity, run.controller.signal, Boolean(run.failedStep));
                if (!current(run)) return;
                if (!run.campaign) { finish(run, null); return; }
                run.attempt = readMetadata(run.owner).attempts[run.campaign.id] || null;
                emit(run, { campaign: run.campaign, attempt: run.attempt });
                if (run.attempt?.ticket) schedule(run, 'status', 0);
                else {
                    const untilOpen = Date.parse(run.campaign.opensAt) - Date.now();
                    if (untilOpen > 0) {
                        run.status = { campaignId: run.campaign.id, state: 'NOT_OPEN', ticket: null,
                            position: 0, expiresAt: 0, serverTime: 0, pollAfterSeconds: 4 };
                        emit(run, { status: run.status });
                        schedule(run, 'join', untilOpen);
                    } else schedule(run, 'join', 0);
                }
            } else {
                if (step === 'join' && !run.attempt) {
                    run.attempt = { campaignId: run.campaign.id, ticket: null, requestId: newReservationRequestId(), expiresAt: 0 };
                    saveMetadata(run.owner, run.attempt);
                }
                if (step === 'status') {
                    const fetchStatus = async signal => {
                        const status = statusOf(await admissionService.status(run.campaign.id, run.attempt.ticket, signal), run.campaign);
                        if (status.ticket && status.ticket !== run.attempt.ticket) throw protocolError('입장권이 변경됐어요. 기존 예약 요청을 먼저 확인해주세요.');
                        return status;
                    };
                    const options = { signal: run.controller.signal, ...admissionPollingTiming(run.status || {}) };
                    // Initial recovery and deliberate retries always verify this tab's ticket with the server.
                    const result = periodic && run.poller ? await run.poller.read(fetchStatus, options)
                        : await readAdmissionStatus(fetchStatus, options);
                    const status = result.source === 'remote' ? { ...result.status, ticket: run.attempt.ticket } : result.status;
                    if (current(run)) applyStatus(run, status, step, result.observedAt, result.source);
                } else {
                    const result = step === 'join' ? await admissionService.join(run.campaign.id, run.controller.signal)
                        : await admissionService.cancel(run.campaign.id, run.attempt.ticket, run.controller.signal);
                    if (current(run)) applyStatus(run, result, step);
                }
            }
        } catch (error) {
            if (!current(run) || run.controller.signal.aborted || error?.name === 'AbortError') return;
            run.failedStep = step;
            run.failures += 1;
            emit(run, { error, errorStep: step });
            const status = error?.status ?? error?.response?.status;
            const transient = !error?.admissionStorageError && !error?.admissionProtocolError
                && (status == null || status === 408 || status === 429 || status >= 500);
            if (transient && (step === 'status' || step === 'join')) {
                const minimum = step === 'join' ? 15000 : 4000;
                const timing = admissionPollingTiming(run.status || {});
                const cap = step === 'join' ? 30000 : timing.retryCapMs;
                schedule(run, step, Math.min(cap, minimum * 2 ** Math.min(run.failures - 1, 3) + Math.random() * 500));
            }
        } finally {
            run.inFlight = false;
            emit(run, { busy: false });
            if (current(run) && run.resume && document.visibilityState !== 'hidden') { run.resume = false; resume(run); }
        }
    }

    function resume(run) {
        if (!current(run)) return;
        if (run.inFlight) { run.resume = true; return; }
        if (LIVE_STATES.has(run.status?.state) && run.attempt?.ticket) void request(run, 'status', true);
        else if (run.next) schedule(run, run.next.step, run.next.at - Date.now());
    }
    const visibilityChanged = () => {
        if (!active) return;
        if (document.visibilityState === 'hidden') {
            clearTimer(active);
            if (active.step === 'status') active.controller?.abort();
        } else resume(active);
    };

    return {
        mount: () => { mounted = true; document.addEventListener('visibilitychange', visibilityChanged); },
        dispose: () => {
            mounted = false;
            document.removeEventListener('visibilitychange', visibilityChanged);
            if (active) finish(active, false);
            lookups.forEach(controller => controller.abort()); lookups.clear();
        },
        syncIdentity: next => {
            if (identity === next) return;
            if (active) finish(active, false);
            lookups.forEach(controller => controller.abort()); lookups.clear();
            lookupCache = null;
            identity = next;
        },
        getPendingAttempt: async (scope, expected) => {
            assertIdentity(expected);
            const controller = new AbortController();
            lookups.add(controller);
            try {
                const campaign = await lookup(scope, expected, controller.signal);
                assertIdentity(expected);
                if (!campaign) return null;
                const attempt = readMetadata(ownerOf(useAuthStore.getState())).attempts[campaign.id];
                return attempt?.ticket ? { ...attempt } : null;
            } finally { lookups.delete(controller); }
        },
        restoreEntry: async (scope, expected, signal) => {
            assertIdentity(expected);
            const owner = ownerOf(useAuthStore.getState());
            if (!Object.values(readMetadata(owner).attempts).some(attempt => attempt.ticket)) return null;
            const controller = new AbortController();
            lookups.add(controller);
            const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
            try {
                const campaign = await lookup(scope, expected, combined);
                assertIdentity(expected);
                if (!campaign || combined.aborted) return null;
                const attempt = readMetadata(owner).attempts[campaign.id];
                if (!attempt?.ticket) return null;
                const requestedAt = Date.now();
                const result = await readAdmissionStatus(async requestSignal =>
                    statusOf(await admissionService.status(campaign.id, attempt.ticket, requestSignal), campaign), { signal: combined });
                assertIdentity(expected);
                if (combined.aborted) throw abortError();
                const status = result.status;
                if (status.ticket && status.ticket !== attempt.ticket) throw protocolError('입장권이 변경됐어요. 기존 예약 요청을 먼저 확인해주세요.');
                // A completed or expired ticket is kept for result recovery, never presented as a live grant.
                if (status.state !== 'ADMITTED' || status.expiresAt <= status.serverTime) return null;
                const expiresAt = status.expiresAt - status.serverTime + Math.min(requestedAt, result.observedAt);
                if (expiresAt <= Date.now()) return null;
                return { ticket: attempt.ticket, requestId: attempt.requestId,
                    expiresAt };
            } finally { lookups.delete(controller); }
        },
        enter: (scope, expected) => {
            try { assertIdentity(expected); scopeKey(scope); } catch (error) { return Promise.reject(error); }
            if (active?.scopeKey === scopeKey(scope)) return active.promise;
            if (active) finish(active, false);
            let resolve;
            const promise = new Promise(done => { resolve = done; });
            const run = { identity: expected, owner: ownerOf(useAuthStore.getState()), scope, scopeKey: scopeKey(scope),
                resolve, promise, timer: null, controller: null, inFlight: false, attempt: null, status: null,
                campaign: null, failures: 0, serverOffset: 0 };
            active = run;
            onChange({ ...EMPTY_VIEW, open: true, busy: true, now: Date.now() });
            void request(run, 'lookup');
            return promise;
        },
        dismiss: expected => { if (active?.identity === expected) finish(active, false); },
        cancel: expected => {
            const run = active;
            if (!run || run.identity !== expected || run.inFlight) return;
            if (!run.attempt?.ticket) { finish(run, false); return; }
            if (['CLAIMED', 'CONSUMED'].includes(run.status?.state)) return;
            void request(run, 'cancel');
        },
        retry: expected => {
            const run = active;
            if (!run || run.identity !== expected || !current(run) || run.inFlight) return;
            let step = run.failedStep || (run.attempt?.ticket ? 'status' : 'join');
            if (['EXPIRED', 'CANCELLED', 'CONSUMED'].includes(run.status?.state) && !run.failedStep) {
                try { if (run.attempt) forgetMetadata(run.owner, run.attempt); }
                catch (error) { emit(run, { error, errorStep: 'status' }); return; }
                run.attempt = null;
                run.status = null;
                run.poller?.dispose(); run.poller = null;
                step = 'join';
                emit(run, { attempt: null, status: null });
            }
            if (run.status?.state === 'NOT_OPEN' && !run.failedStep) {
                schedule(run, 'join', Date.parse(run.campaign.opensAt) - (Date.now() + run.serverOffset));
            } else void request(run, step);
        },
        continueReservation: expected => {
            const run = active;
            if (!run || run.identity !== expected || !current(run) || run.inFlight || run.failedStep
                || run.status?.state !== 'ADMITTED' || run.status.expiresAt <= Date.now() + run.serverOffset) return;
            finish(run, { ticket: run.attempt.ticket, requestId: run.attempt.requestId,
                expiresAt: run.status.expiresAt - run.serverOffset });
        },
        complete: (attempt, expected) => {
            try {
                assertIdentity(expected);
                if (!UUID.test(attempt?.requestId ?? '')) return;
                const owner = ownerOf(useAuthStore.getState());
                const saved = Object.values(readMetadata(owner).attempts).find(record => record.requestId === attempt.requestId
                    && (!attempt.ticket || record.ticket === attempt.ticket));
                if (saved) forgetMetadata(owner, saved);
            } catch { /* A confirmed reservation remains authoritative; leftover metadata can only replay the same request. */ }
        },
    };
}

/** Call getPendingAttempt before reservation recovery; enter never submits a reservation. */
export default function useReservationAdmission() {
    const identity = useAuthStore(sessionIdentity);
    const [view, setView] = useState(EMPTY_VIEW);
    const [flow] = useState(() => createAdmissionFlow(setView));
    useEffect(() => { flow.mount(); return () => flow.dispose(); }, [flow]);
    useLayoutEffect(() => { flow.syncIdentity(identity); }, [flow, identity]);
    useEffect(() => {
        if (!view.open || view.status?.state !== 'ADMITTED') return undefined;
        const timer = setInterval(() => setView(previous => ({ ...previous, now: Date.now() })), 1000);
        return () => clearInterval(timer);
    }, [view.open, view.status?.state]);
    const enter = useCallback(scope => flow.enter(scope, identity), [flow, identity]);
    const getPendingAttempt = useCallback(scope => flow.getPendingAttempt(scope, identity), [flow, identity]);
    const restoreEntry = useCallback((scope, signal) => flow.restoreEntry(scope, identity, signal), [flow, identity]);
    const complete = useCallback(attempt => flow.complete(attempt, identity), [flow, identity]);
    const cancel = useCallback(() => flow.cancel(identity), [flow, identity]);
    const onClose = useCallback(() => flow.dismiss(identity), [flow, identity]);
    const onRetry = useCallback(() => flow.retry(identity), [flow, identity]);
    const onContinue = useCallback(() => flow.continueReservation(identity), [flow, identity]);
    const remainingSeconds = view.status?.expiresAt > 0 ? Math.max(0, Math.ceil((view.status.expiresAt - view.now - view.serverOffset) / 1000)) : null;
    return { enter, getPendingAttempt, restoreEntry, complete, cancel,
        modalProps: { open: view.open, busy: view.busy, campaign: view.campaign, status: view.status,
            error: view.error, errorStep: view.errorStep, hasTicket: Boolean(view.attempt?.ticket), remainingSeconds,
            canContinue: view.status?.state === 'ADMITTED' && remainingSeconds > 0 && !view.busy && !view.error,
            onClose, onCancel: cancel, onRetry, onContinue } };
}
