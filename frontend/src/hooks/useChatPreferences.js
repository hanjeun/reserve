import { useSyncExternalStore } from 'react';

// 채팅 설정과 말풍선이 같은 기기별 설정을 구독한다. 대화/계정 정보는 저장하지 않는다.
const STORAGE_KEY = 'reserve:chat-color';
export const CHAT_COLOR_OPTIONS = [
    { value: 'blue', label: '블루', background: '#2563eb', foreground: '#fff' },
    { value: 'violet', label: '바이올렛', background: '#7048e8', foreground: '#fff' },
    { value: 'teal', label: '틸', background: '#087f5b', foreground: '#fff' },
    { value: 'rose', label: '로즈', background: '#c2255c', foreground: '#fff' },
    { value: 'neutral', label: '그레이', background: '#333d4b', foreground: '#fff' },
];
const normalize = value => CHAT_COLOR_OPTIONS.some(option => option.value === value) ? value : 'blue';
const read = () => {
    try { return normalize(localStorage.getItem(STORAGE_KEY)); }
    catch { return 'blue'; }
};
let color = read();
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const emit = () => listeners.forEach(listener => listener());
const setColor = value => {
    color = normalize(value);
    try { localStorage.setItem(STORAGE_KEY, color); } catch { /* 저장 불가 기기에서는 메모리에 유지한다. */ }
    emit();
};
if (typeof window !== 'undefined') {
    window.addEventListener('storage', event => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        try { if (event.storageArea !== localStorage) return; }
        catch { return; }
        color = read();
        emit();
    });
}

export default function useChatPreferences() {
    const selected = useSyncExternalStore(subscribe, () => color, () => 'blue');
    return { color: selected, setColor, palette: CHAT_COLOR_OPTIONS.find(option => option.value === selected) };
}
