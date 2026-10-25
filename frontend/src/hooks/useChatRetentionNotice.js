import { useCallback, useEffect, useSyncExternalStore } from 'react';

const STORAGE_PREFIX = 'reserve:chat-retention-notice:v1:';
const IDLE_MS = 24 * 60 * 60 * 1000;
const records = new Map();
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const serverSnapshot = () => true;

function parseRecord(raw) {
    try {
        const value = JSON.parse(raw);
        if (Number.isFinite(value?.lastActiveAt) && value.lastActiveAt >= 0
            && typeof value.dismissed === 'boolean') return { lastActiveAt: value.lastActiveAt, dismissed: value.dismissed };
    } catch { /* 설정이 없거나 유효하지 않으면 보관 안내를 표시한다. */ }
    return { lastActiveAt: 0, dismissed: false };
}

function recordOf(key, storageKey) {
    // 메신저를 닫은 동안 다른 탭에서 설정을 바꿨을 수 있다.
    try {
        if (storageKey) {
            const stored = parseRecord(localStorage.getItem(storageKey));
            const current = records.get(key);
            if (!current || stored.lastActiveAt >= current.lastActiveAt) records.set(key, stored);
        }
    } catch { /* 브라우저 저장소를 쓸 수 없어도 메모리 설정은 유지한다. */ }
    if (!records.has(key)) records.set(key, { lastActiveAt: 0, dismissed: false });
    return records.get(key);
}

const isVisible = (record, now = Date.now()) => !record.dismissed
    || now - record.lastActiveAt >= IDLE_MS || record.lastActiveAt > now;

function saveRecord(key, storageKey, record) {
    records.set(key, record);
    // 시각과 안내 플래그만 저장하고 대화·첨부·초안은 저장하지 않는다.
    try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(record)); } catch { /* 저장소 오류 시 메모리 값만 유지한다. */ }
    listeners.forEach(listener => listener());
}

/* 회원·브라우저마다 안내하며 메신저를 떠난 지 24시간 뒤 다시 표시한다. */
export default function useChatRetentionNotice(memberId, sessionIdentity) {
    const storageKey = Number.isSafeInteger(Number(memberId)) && Number(memberId) > 0
        ? `${STORAGE_PREFIX}${Number(memberId)}` : null;
    const key = storageKey ?? `session:${sessionIdentity}`;
    const getSnapshot = useCallback(() => isVisible(recordOf(key, storageKey)), [key, storageKey]);
    const visible = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

    useEffect(() => {
        let present = document.visibilityState === 'visible' && document.hasFocus();
        const touch = () => {
            const record = recordOf(key, storageKey);
            saveRecord(key, storageKey, { lastActiveAt: Date.now(), dismissed: !isVisible(record) });
        };
        const leave = () => {
            const record = recordOf(key, storageKey);
            saveRecord(key, storageKey, { ...record, lastActiveAt: Date.now() });
        };
        const syncPresence = () => {
            const next = document.visibilityState === 'visible' && document.hasFocus();
            if (present && !next) leave();
            if (!present && next) touch();
            present = next;
        };
        const onPageHide = () => { if (present) leave(); present = false; };
        if (present) touch();
        const timer = setInterval(() => { if (present) touch(); }, 60000);
        const onStorage = event => {
            if (!storageKey || event.key !== storageKey) return;
            try { if (event.storageArea !== localStorage) return; } catch { return; }
            const incoming = parseRecord(event.newValue);
            const current = recordOf(key, storageKey);
            if (event.newValue !== null && incoming.lastActiveAt < current.lastActiveAt) return;
            records.set(key, incoming);
            listeners.forEach(listener => listener());
        };
        document.addEventListener('visibilitychange', syncPresence);
        window.addEventListener('focus', syncPresence);
        window.addEventListener('blur', syncPresence);
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('pageshow', syncPresence);
        window.addEventListener('storage', onStorage);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', syncPresence);
            window.removeEventListener('focus', syncPresence);
            window.removeEventListener('blur', syncPresence);
            window.removeEventListener('pagehide', onPageHide);
            window.removeEventListener('pageshow', syncPresence);
            window.removeEventListener('storage', onStorage);
            if (present) leave();
        };
    }, [key, storageKey]);

    const dismiss = useCallback(() => {
        saveRecord(key, storageKey, { lastActiveAt: Date.now(), dismissed: true });
    }, [key, storageKey]);
    return { visible, dismiss };
}
