export const BENEFIT_IMAGE_FALLBACK = '/icons/R_logo.png';

// 공개 소식은 가게 사진만 사용한다. 임의 외부 이미지·data/blob URL은 요청하지 않는다.
export function getBenefitImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return BENEFIT_IMAGE_FALLBACK;
    const origin = globalThis.location?.origin ?? 'https://reserve.it.kr';
    const apiOrigin = import.meta.env.VITE_API_BASE_URL || origin;
    try {
        if (value.startsWith('/uploads/')) {
            const url = new URL(value, apiOrigin);
            return /^https?:$/.test(url.protocol) && url.pathname.startsWith('/uploads/') ? url.href : BENEFIT_IMAGE_FALLBACK;
        }
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'cdn.reserve.it.kr' && !url.username && !url.password
            ? url.href : BENEFIT_IMAGE_FALLBACK;
    } catch {
        return BENEFIT_IMAGE_FALLBACK;
    }
}

export function formatBenefitDate(value) {
    // 서버가 준 작성 시각만 표시한다. 쿠폰 유효 기간을 추측하지 않는다.
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10).replaceAll('-', '.') : '';
}
