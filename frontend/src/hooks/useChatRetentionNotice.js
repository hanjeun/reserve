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
    } catch { /* A missing or invalid preference starts with the notice visible. */ }
    return { lastActiveAt: 0, dismissed: false };
}

function recordOf(key, storageKey) {
    // Another tab may have been used while this messenger was unmounted.
    try {
        if (storageKey) {
            const stored = parseRecord(localStorage.getItem(storageKey));
            const current = records.get(key);
            if (!current || stored.lastActiveAt >= current.lastActiveAt) records.set(key, stored);
        }
    } catch { /* Memory remains available when browser storage is blocked. */ }
    if (!records.has(key)) records.set(key, { lastActiveAt: 0, dismissed: false });
    return records.get(key);
}

const isVisible = (record, now = Date.now()) => !record.dismissed
    || now - record.lastActiveAt >= IDLE_MS || record.lastActiveAt > now;

function saveRecord(key, storageKey, record) {
    records.set(key, record);
    // Only a timestamp and notice flag are persisted, never messages, attachments or drafts.
    try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(record)); } catch { /* Keep it in memory. */ }
    listeners.forEach(listener => listener());
}

/** One reminder per member/browser, renewed after 24 hours away from the messenger. */
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
