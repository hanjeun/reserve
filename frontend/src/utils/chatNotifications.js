const THROTTLE_MS = 60000;
const MAX_ROOMS = 50;
const ROLES = new Set(['MEMBER', 'OWNER', 'ADMIN']);
const TITLE = 'RESERVE 새 메시지';
const BODY = '새 메시지가 도착했어요. RESERVE에서 확인해주세요.';
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

/*
 * 사용자 클릭으로 활성화한 현재 PC 세션에만 새 메시지를 알린다. 본문·이름을 읽거나 저장하지 않으며 대화 열기는 호출부가 세션·접근 권한을 재확인한다.
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
    // 방별 최대 메시지 ID로 이미 알린 메시지의 재생을 막는다.
    // 숫자 커서만 제한된 개수로 보관하고 메시지·참가자 정보는 저장하지 않는다.
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
            try { onStateChange?.(state); } catch { /* UI 콜백 오류는 알림 권한 상태를 바꾸지 않는다. */ }
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

        // requestPermission을 지연 없이 호출해 사용자 제스처를 유지한다.
        // async 본문은 즉시 실행되고 동기 예외도 아래 catch로 전달된다.
        const request = (async () => NotificationApi.requestPermission())();
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
                try { onOpen?.(roomId); } catch { /* 대화 열기 오류에도 알림은 닫는다. */ }
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
