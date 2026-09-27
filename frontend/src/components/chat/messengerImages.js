import { getImageUrl } from '../../utils/image';

export const MESSENGER_COVER_IMAGE = '/og-image.png';
export const MESSENGER_BRAND_AVATAR = '/icons/RESERVE_logo.png';

// 표시용 사진만 허용한다. 이미지 값으로 탐색/스크립트를 실행하지 않는다.
export function getMessengerImageUrl(value, fallback = null) {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    const source = value.trim();
    if (/^\/(?:icons\/|images\/|og-image\.png$)/.test(source)) return source;
    try {
        const origin = globalThis.location?.origin ?? 'https://reserve.it.kr';
        const url = new URL(source.startsWith('/uploads/') ? getImageUrl(source) : source, origin);
        const apiOrigin = new URL(import.meta.env.VITE_API_BASE_URL || origin, origin).origin;
        if (url.username || url.password) return fallback;
        if (url.protocol === 'https:' || (url.protocol === 'http:' && [origin, apiOrigin].includes(url.origin))) return url.href;
    } catch { /* 잘못된 사진은 브랜드 이미지로 표시한다. */ }
    return fallback;
}
