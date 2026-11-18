import { useSyncExternalStore } from 'react';

// 눈 효과를 끈 기존 브라우저의 설정을 이어받는다.
const STORAGE_KEY = 'reserve-winter-effect-off';
const CHANGE_EVENT = 'reserve:season-effect-change';
let sessionPreference;

function getPreference() {
    if (sessionPreference !== undefined) return sessionPreference;
    try { return localStorage.getItem(STORAGE_KEY) !== '1'; }
    catch { return true; }
}

function subscribe(listener) {
    const onStorage = event => {
        if (event.key === STORAGE_KEY || event.key === null) {
            sessionPreference = undefined;
            listener();
        }
    };
    window.addEventListener(CHANGE_EVENT, listener);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, listener);
        window.removeEventListener('storage', onStorage);
    };
}

function setPreference(enabled) {
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? '0' : '1');
        sessionPreference = undefined;
    } catch { sessionPreference = enabled; }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export default function useSeasonEffectPreference() {
    return [useSyncExternalStore(subscribe, getPreference, () => true), setPreference];
}
