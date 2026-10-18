const checkedOrigin = (value, fallback) => {
    const url = new URL(value || fallback);
    const local = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/')
        throw new Error('서비스 주소는 HTTPS 출처여야 해요.');
    return url.origin;
};
export const APP_ORIGIN = checkedOrigin(import.meta.env.VITE_APP_ORIGIN, 'https://reserve.it.kr');
export const MARKETING_ORIGIN = checkedOrigin(import.meta.env.VITE_MARKETING_ORIGIN, 'https://reserve.it.kr');
export const LEGACY_ORIGIN = checkedOrigin(import.meta.env.VITE_LEGACY_APP_ORIGIN, 'https://reserve.it.kr');
export const appUrl = path => {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')
        || Array.from(path).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('앱 내부 경로가 필요해요.');
    const origin = import.meta.env.DEV && typeof window !== 'undefined' ? window.location.origin : APP_ORIGIN;
    return origin + path;
};
