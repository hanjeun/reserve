const CHANNEL_PREFIX = 'reserve-admission-poll-v1:';
const STATES = new Set(['WAITING', 'ADMITTED', 'CLAIMED', 'CONSUMED', 'EXPIRED', 'CANCELLED', 'NOT_OPEN', 'CLOSED', 'FULL', 'BYPASS', 'NOT_JOINED']);
const activeCoordinators = new Set();
const abortError = () => new DOMException('입장 상태 조회를 중단했어요.', 'AbortError');

/* 예약 훅에서 더 좁은 서버 상태 계약을 검증한 뒤 호출한다. */
export function admissionPollingTiming(status = {}) {
    const heartbeat = Number(status.heartbeatTimeoutSeconds);
    const heartbeatTimeoutSeconds = Number.isFinite(heartbeat) && heartbeat >= 30 && heartbeat <= 86400 ? heartbeat : 90;
    const requestedPoll = Number(status.pollAfterSeconds);
    const pollAfterSeconds = Math.min(heartbeatTimeoutSeconds / 3, 60,
        Number.isFinite(requestedPoll) && requestedPoll > 0 ? Math.max(4, requestedPoll) : 4);
    const requestTimeoutMs = Math.min(10000, heartbeatTimeoutSeconds * 1000 / 6);
    const failoverWaitMs = Math.min(2000, heartbeatTimeoutSeconds * 1000 / 12);
    return { heartbeatTimeoutSeconds, pollAfterSeconds, intervalMs: pollAfterSeconds * 1000,
        requestTimeoutMs, failoverWaitMs,
        retryCapMs: Math.min(30000, heartbeatTimeoutSeconds * 1000 / 3 - requestTimeoutMs - failoverWaitMs) };
}

/* AbortSignal 뒤에도 완료하지 않는 요청의 대기 시간을 제한한다. */
export function readAdmissionStatus(fetchStatus, { signal, ...status } = {}) {
    const timing = admissionPollingTiming(status);
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        let settled = false;
        let timer;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', aborted);
            if (error) reject(error);
            else resolve(value);
        };
        const aborted = () => { controller.abort(); finish(abortError()); };
        if (signal?.aborted) { aborted(); return; }
        signal?.addEventListener('abort', aborted, { once: true });
        timer = setTimeout(() => {
            controller.abort();
            finish(Object.assign(new Error('입장 상태 확인이 지연되고 있어요. 잠시 후 다시 확인할게요.'), { admissionPollingTimeout: true }));
        }, timing.requestTimeoutMs);
        Promise.resolve().then(() => {
            if (controller.signal.aborted) throw abortError();
            return fetchStatus(controller.signal);
        }).then(value => finish(null, { status: value, observedAt: Date.now(), source: 'server' }), error => finish(error));
    });
}

function snapshotOf(value, campaignId, ticket) {
    if (!value || value.campaignId !== campaignId || !STATES.has(value.state)
        || !Number.isSafeInteger(value.position) || value.position < 0
        || !Number.isSafeInteger(value.expiresAt) || value.expiresAt < 0
        || !Number.isSafeInteger(value.serverTime) || value.serverTime <= 0
        || value.state === 'WAITING' && value.position < 1
        || value.state === 'ADMITTED' && value.expiresAt === 0
        || value.heartbeatTimeoutSeconds != null && (!Number.isFinite(value.heartbeatTimeoutSeconds)
            || value.heartbeatTimeoutSeconds < 30 || value.heartbeatTimeoutSeconds > 86400)
        || value.pollAfterSeconds != null && (!Number.isFinite(value.pollAfterSeconds)
            || value.pollAfterSeconds < 4 || value.pollAfterSeconds > 60)
        || value.mode != null && !['OFF', 'CORE', 'EMERGENCY'].includes(value.mode)
        || value.absoluteExpiresAt != null && (!Number.isSafeInteger(value.absoluteExpiresAt) || value.absoluteExpiresAt < 0)
        || value.continuityId != null && (!/^[0-9a-f]{64}$/.test(value.continuityId) || value.continuityId !== ticket)) return null;
    const timing = admissionPollingTiming(value);
    // 공유 데이터에서 입장권·요청 ID·인증 정보·임의 응답 필드를 제외한다.
    const snapshot = { campaignId, state: value.state, position: value.position, expiresAt: value.expiresAt,
        serverTime: value.serverTime, pollAfterSeconds: timing.pollAfterSeconds,
        heartbeatTimeoutSeconds: timing.heartbeatTimeoutSeconds };
    if (value.mode != null) snapshot.mode = value.mode;
    if (value.absoluteExpiresAt != null) snapshot.absoluteExpiresAt = value.absoluteExpiresAt;
    if (value.continuityId !== undefined) snapshot.continuityId = value.continuityId;
    return snapshot;
}

/*
 * 현재 탭의 입장권을 서버에서 검증한 뒤 주기 조회만 조정한다. 조회별 짧은 잠금을 쓰고 지연 시 제한된 중복 조회를 허용하며 공유 상태를 쓰기 권한으로 사용하지 않는다.
 */
export function createAdmissionPollingCoordinator({ owner, campaignId, ticket, verifiedStatus,
    isCurrent = () => true, isVisible = () => true }) {
    const startedAt = Date.now();
    const stableOwner = typeof owner === 'string' && owner.length ? ['anonymous', owner]
        : owner?.userId != null && owner?.role ? ['member', String(owner.userId), String(owner.role)] : null;
    const initialStatus = snapshotOf(verifiedStatus, campaignId, ticket);
    const clockOffset = initialStatus ? initialStatus.serverTime - startedAt : 0;
    const operations = new Set();
    const waiters = new Set();
    let disposed = false;
    let channel = null;
    let scope = null;
    let locks = null;
    let latest = null;
    let initialized = false;
    const current = () => !disposed && isCurrent() && isVisible();
    const assertCurrent = signal => { if (!current() || signal?.aborted) throw abortError(); };
    const disableSharing = () => {
        channel?.close();
        channel = null;
        locks = null;
        latest = null;
    };
    const visibilityChanged = () => {
        if (!isVisible()) operations.forEach(controller => controller.abort());
    };
    globalThis.document?.addEventListener('visibilitychange', visibilityChanged);
    const fresh = timing => latest && latest.observedAt >= startedAt
        && Date.now() >= latest.observedAt && Date.now() - latest.observedAt < timing.intervalMs ? latest : null;
    const receive = event => {
        if (!current() || event.data?.version !== 1 || event.data.scope !== scope) return;
        const observedAt = event.data.observedAt;
        const status = snapshotOf(event.data.status, campaignId, ticket);
        if (!status || !Number.isSafeInteger(observedAt) || observedAt < startedAt || observedAt > Date.now()
            || Date.now() - observedAt >= admissionPollingTiming(status).intervalMs
            || status.serverTime < initialStatus.serverTime
            || Math.abs(status.serverTime - observedAt - clockOffset) > 15000
            || latest && (observedAt < latest.observedAt || status.serverTime < latest.status.serverTime)) return;
        latest = { status, observedAt, source: 'remote' };
        waiters.forEach(wake => wake());
    };
    void (async () => {
        try {
            if (!initialStatus || !stableOwner || !campaignId || !ticket
                || !globalThis.navigator?.locks?.request || !globalThis.BroadcastChannel || !globalThis.crypto?.subtle) return;
            const key = JSON.stringify([stableOwner, campaignId, ticket]);
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
            if (disposed) return;
            scope = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
            channel = new BroadcastChannel(`${CHANNEL_PREFIX}${scope}`);
            channel.addEventListener('message', receive);
            locks = navigator.locks;
        } catch { disableSharing(); }
        finally { initialized = true; }
    })();

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        operations.forEach(controller => controller.abort());
        operations.clear();
        waiters.clear();
        globalThis.document?.removeEventListener('visibilitychange', visibilityChanged);
        disableSharing();
        activeCoordinators.delete(dispose);
    };
    activeCoordinators.add(dispose);

    function waitForSnapshot(signal, timing) {
        return new Promise((resolve, reject) => {
            let timer;
            const finish = (error, value) => {
                clearTimeout(timer);
                waiters.delete(wake);
                signal.removeEventListener('abort', aborted);
                if (error) reject(error);
                else resolve(value);
            };
            const wake = () => { const cached = fresh(timing); if (cached) finish(null, cached); };
            const aborted = () => finish(abortError());
            if (signal.aborted) { aborted(); return; }
            waiters.add(wake);
            signal.addEventListener('abort', aborted, { once: true });
            timer = setTimeout(() => finish(null, fresh(timing)), timing.failoverWaitMs);
            wake();
        });
    }

    return { dispose,
        async read(fetchStatus, { signal, ...status } = {}) {
            const controller = new AbortController();
            const aborted = () => controller.abort();
            if (signal?.aborted) controller.abort();
            signal?.addEventListener('abort', aborted, { once: true });
            operations.add(controller);
            const timing = admissionPollingTiming(status);
            const fetchOne = async () => {
                assertCurrent(controller.signal);
                const result = await readAdmissionStatus(fetchStatus, { signal: controller.signal, ...timing });
                assertCurrent(controller.signal);
                const snapshot = snapshotOf(result.status, campaignId, ticket);
                if (snapshot && snapshot.serverTime >= initialStatus?.serverTime) {
                    // 느린 조회와 대체 조회가 겹쳐도 이전 응답으로 새 공유 결과를 되돌리지 않는다.
                    // 오래된 결과는 호출부에서 후속 조회를 예약한다.
                    if (latest && latest.status.serverTime > snapshot.serverTime) return { ...latest, source: 'remote' };
                    latest = { ...result, status: snapshot };
                    try { channel?.postMessage({ version: 1, scope, observedAt: result.observedAt, status: snapshot }); }
                    catch { disableSharing(); }
                }
                return result;
            };
            const tryLock = async () => {
                let entered = false;
                try {
                    return await locks.request(`${CHANNEL_PREFIX}${scope}`, { ifAvailable: true }, async lock => {
                        entered = true;
                        assertCurrent(controller.signal);
                        if (!lock) return null;
                        const cached = fresh(timing);
                        return cached ? { ...cached, source: 'remote' } : fetchOne();
                    });
                } catch (error) {
                    if (entered) throw error;
                    // 제한된 브라우저는 API를 노출해도 실행을 거절할 수 있다.
                    disableSharing();
                    return fetchOne();
                }
            };
            try {
                assertCurrent(controller.signal);
                // 해시·채널 초기화 지연으로 하트비트를 늦추지 않는다.
                if (!initialized || !locks || !channel) return await fetchOne();
                const cached = fresh(timing);
                let result = cached ? { ...cached, source: 'remote' } : await tryLock();
                if (!result) result = await waitForSnapshot(controller.signal, timing);
                if (!result) result = await tryLock();
                if (!result) result = await fetchOne();
                assertCurrent(controller.signal);
                return result;
            } finally {
                operations.delete(controller);
                signal?.removeEventListener('abort', aborted);
            }
        },
    };
}

import.meta.hot?.dispose(() => { for (const dispose of [...activeCoordinators]) dispose(); });
