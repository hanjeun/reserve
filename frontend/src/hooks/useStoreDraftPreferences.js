import { useCallback, useSyncExternalStore } from 'react';
import { hasOwnerAccess } from '../constants/roles';
import useAuthStore from '../store/useAuthStore';

const STORAGE_PREFIX = 'reserve:store-draft:auto-save:member:';
const memorySettings = new Map();
const listeners = new Set();
const preferenceKey = user => hasOwnerAccess(user?.role) && user?.id != null
    ? `${STORAGE_PREFIX}${String(user.id)}`
    : null;
const subscribe = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const emit = () => listeners.forEach(listener => listener());
const readPreference = key => {
    if (!key) return false;
    if (memorySettings.has(key)) return memorySettings.get(key);
    try { return localStorage.getItem(key) !== 'false'; }
    catch { return memorySettings.get(key) ?? true; }
};

// 초안과 같은 계정·브라우저 범위의 설정이다. 다른 계정이나 기기로 동기화하지 않는다.
export const getStoreDraftAutoSaveEnabled = user => readPreference(preferenceKey(user));

if (typeof window !== 'undefined') {
    window.addEventListener('storage', event => {
        if (event.key !== null && !event.key?.startsWith(STORAGE_PREFIX)) return;
        try { if (event.storageArea !== localStorage) return; }
        catch { return; }
        if (event.key === null) memorySettings.clear();
        else memorySettings.delete(event.key);
        emit();
    });
}

export default function useStoreDraftPreferences(user) {
    const key = preferenceKey(user);
    const autoSaveEnabled = useSyncExternalStore(subscribe, () => readPreference(key), () => Boolean(key));
    const setAutoSaveEnabled = useCallback(enabled => {
        if (!key || preferenceKey(useAuthStore.getState().user) !== key) return;
        const value = Boolean(enabled);
        try {
            localStorage.setItem(key, String(value));
            memorySettings.delete(key);
        } catch { memorySettings.set(key, value); }
        emit();
    }, [key]);
    return { autoSaveEnabled, setAutoSaveEnabled };
}
