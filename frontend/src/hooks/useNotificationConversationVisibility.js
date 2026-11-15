import { useCallback, useEffect, useSyncExternalStore } from 'react';

const PREFIX = 'reserve:notification-conversation-hidden:v1:';
const fallback = new Map();
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const notify = () => listeners.forEach(listener => listener());
const serverSnapshot = () => false;

function read(key) {
    if (!key) return false;
    if (fallback.has(key)) return fallback.get(key);
    try { return localStorage.getItem(key) === 'true'; }
    catch { return false; }
}

export default function useNotificationConversationVisibility(memberId) {
    const id = Number(memberId);
    const key = Number.isSafeInteger(id) && id > 0 ? PREFIX + id : null;
    const snapshot = useCallback(() => read(key), [key]);
    const hidden = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
    useEffect(() => {
        const sync = event => {
            if (event.key === key || event.key === null) {
                fallback.delete(key);
                notify();
            }
        };
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, [key]);
    const setHidden = useCallback(value => {
        if (!key) return;
        // 대화 내용·읽음 상태는 저장하지 않고 회원별 표시 설정만 기억한다.
        try {
            localStorage.setItem(key, String(Boolean(value)));
            fallback.delete(key);
        } catch { fallback.set(key, Boolean(value)); }
        notify();
    }, [key]);
    return { hidden, setHidden };
}
