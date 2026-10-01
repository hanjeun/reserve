const THROTTLE_MS = 60000;
const MAX_ROOMS = 50;
const ROLES = new Set(['MEMBER', 'OWNER', 'ADMIN']);
const TITLE = 'RESERVE 새 메시지';
const BODY = '새 메시지가 도착했습니다. RESERVE에서 확인해주세요.';
const TAG = 'reserve-chat';

const positiveId = (value) => (
    Number.isSafeInteger(value) && value > 0 ? value : null
);

const readFlag = (flag, fallback = false) => {
    try {
        return Boolean(typeof flag === 'function' ? flag() : flag);
    } catch {
        return fallback;
    }
};

// 방별 커서(previous) 기준으로 가장 큰 서버 id와 상대가 보낸 새 메시지 여부를 계산한다.
const scanMessages = (messages, previous, viewerRole) => {
    let highest = previous;
    let hasIncoming = false;
    for (const message of messages) {
        const id = positiveId(message?.id);
        if (id === null || !ROLES.has(message.senderRole)) continue;
        highest = Math.max(highest, id);
        if (id > previous && message.senderRole !== viewerRole) hasIncoming = true;
    }
    return { highest, hasIncoming };
};

/**
 * PC 브라우저 세션용 알림. enable은 반드시 사용자 클릭 핸들러에서 호출한다.
 * 초깃값은 OFF이며 서버·저장장치·Service Worker와 연결하지 않는다.
 * notify에는 최초 이력이 아닌 새 폴링 메시지를 넘긴다. 본문·이름은 읽지도 않는다.
 * onOpen은 호출부가 현재 로그인 세션과 대화 접근 권한을 다시 확인하는 콜백이다.
 */
export function createChatNotifier({
    NotificationApi = globalThis.Notification,
    isSecureContext = () => globalThis.isSecureContext === true,
    isForeground = () => (
        typeof document !== 'undefined'
        && document.visibilityState === 'visible'
        && document.hasFocus()
    ),
    now = Date.now,
    onOpen,
    onStateChange,
} = {}) {
    let optedIn = false;
    let disposed = false;
    let generation = 0;
    let pendingEnable = null;
    let lastDisplayedAt = null;
    let displayed = null;
    // 서버 id는 단조 증가한다. 방별 high-water cursor로 예전 메시지 재생도 막는다.
    // LRU 50개 숫자만 보관하며 메시지나 사람·가게 정보를 담지 않는다.
    const seen = new Map();

    const permission = () => {
        try {
            const value = NotificationApi?.permission;
            return value === 'granted' || value === 'denied' ? value : 'default';
        } catch {
            return 'default';
        }
    };

    const availability = () => {
        if (typeof NotificationApi !== 'function'
            || typeof NotificationApi.requestPermission !== 'function') return 'unsupported';
        if (!readFlag(isSecureContext)) return 'insecure';
        return permission() === 'denied' ? 'denied' : 'off';
    };

    let status = availability();

    const snapshot = () => ({ status, enabled: optedIn, permission: permission() });

    const closeDisplayed = () => {
        const notification = displayed;
        displayed = null;
        if (!notification) return;
        try {
            notification.onclick = null;
            notification.onclose = null;
            notification.close();
        } catch { /* 이미 닫힌 OS 알림도 안전하게 정리한다. */ }
    };

    const change = (nextStatus, enabled = false) => {
        const changed = status !== nextStatus || optedIn !== enabled;
        status = nextStatus;
        optedIn = enabled;
        const state = snapshot();
        if (changed) {
            try { onStateChange?.(state); } catch { /* UI 콜백 실패는 권한 상태에 영향을 주지 않는다. */ }
        }
        return state;
    };

    const getState = () => {
        if (disposed) return snapshot();
        const unavailable = availability();
        if (unavailable !== 'off' || (optedIn && permission() !== 'granted')) {
            generation += 1;
            pendingEnable = null;
            closeDisplayed();
            return change(unavailable);
        }
        if (status === 'denied' || status === 'insecure' || status === 'unsupported') {
            return change('off');
        }
        return snapshot();
    };

    const enable = () => {
        const current = getState();
        if (disposed || current.status === 'unsupported'
            || current.status === 'insecure' || current.status === 'denied') {
            return Promise.resolve(current);
        }
        if (current.enabled) return Promise.resolve(current);
        if (pendingEnable) return pendingEnable;
        const ticket = ++generation;
        if (permission() === 'granted') return Promise.resolve(change('enabled', true));
        change('requesting');

        // requestPermission을 await 앞에서 호출해야 사용자 제스처를 잃지 않는다.
        // 사용자 제스처를 유지하고 동기 예외도 같은 rejection 경로로 처리한다.
        let request;
        try {
            request = Promise.resolve(NotificationApi.requestPermission());
        } catch (error) {
            request = Promise.reject(error);
        }
        const pending = request
            .then((result) => {
                if (disposed || ticket !== generation) return getState();
                const unavailable = availability();
                if (result === 'granted' && unavailable === 'off' && permission() === 'granted') {
                    return change('enabled', true);
                }
                return change(unavailable);
            })
            .catch(() => (
                disposed || ticket !== generation ? getState() : change('error')
            ))
            .finally(() => {
                if (pendingEnable === pending) pendingEnable = null;
            });
        pendingEnable = pending;
        return pending;
    };

    const disable = () => {
        if (disposed) return snapshot();
        generation += 1;
        pendingEnable = null;
        closeDisplayed();
        return change(availability());
    };

    const notify = ({ roomId, messages, viewerRole } = {}) => {
        if (disposed || positiveId(roomId) === null
            || !ROLES.has(viewerRole) || !Array.isArray(messages)) return false;
        const { highest, hasIncoming } = scanMessages(messages, seen.get(roomId) ?? 0, viewerRole);
        if (highest > 0) {
            seen.delete(roomId);
            seen.set(roomId, highest);
            if (seen.size > MAX_ROOMS) seen.delete(seen.keys().next().value);
        }
        // OFF·포그라운드·스로틀 중에 받은 메시지도 seen 처리하여 나중에 다시 알리지 않는다.
        const current = getState();
        if (!hasIncoming || !current.enabled || readFlag(isForeground, true)) return false;
        let timestamp;
        try { timestamp = now(); } catch { return false; }
        if (!Number.isFinite(timestamp) || (lastDisplayedAt !== null
            && timestamp - lastDisplayedAt < THROTTLE_MS)) return false;

        const ticket = generation;
        try {
            // payload는 이 고정 문구뿐이다. room id도 OS tag/data에 넣지 않는다.
            closeDisplayed();
            const notification = new NotificationApi(TITLE, { body: BODY, tag: TAG });
            displayed = notification;
            lastDisplayedAt = timestamp;
            notification.onclick = () => {
                if (disposed || displayed !== notification || ticket !== generation
                    || !getState().enabled) return;
                closeDisplayed();
                try { onOpen?.(roomId); } catch { /* 현재 세션에서 대화 열기에 실패해도 안전하게 닫는다. */ }
            };
            notification.onclose = () => {
                if (displayed === notification) displayed = null;
            };
            return true;
        } catch {
            generation += 1;
            closeDisplayed();
            change(availability() === 'off' ? 'error' : availability());
            return false;
        }
    };

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        generation += 1;
        pendingEnable = null;
        closeDisplayed();
        seen.clear();
        change('disposed');
    };

    return { getState, enable, disable, notify, dispose };
}
