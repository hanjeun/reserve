import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';

export const SOCIAL_LOGIN_LABELS = Object.freeze({ NAVER: '네이버', KAKAO: '카카오', GOOGLE: 'Google' });

export function socialLoginLabel(provider) {
    return typeof provider === 'string' && Object.hasOwn(SOCIAL_LOGIN_LABELS, provider)
        ? SOCIAL_LOGIN_LABELS[provider] : undefined;
}

/* OAuth는 API 출처에서 시작해 등록된 콜백 주소를 유지한다. */
export function oauthAuthorizationUrl(provider, accountLink, rememberMe) {
    const key = typeof provider === 'string' ? provider.toUpperCase() : '';
    if (!Object.hasOwn(API_ENDPOINTS.OAUTH, key)) throw new Error('로그인 제공자를 확인하지 못했어요.');
    const url = `${(API_BASE_URL || '').replace(/\/+$/, '')}${API_ENDPOINTS.OAUTH[key]}`;
    if (rememberMe !== undefined && typeof rememberMe !== 'boolean') throw new Error('로그인 유지 선택을 확인해주세요.');
    const params = new URLSearchParams();
    if (accountLink !== undefined && (typeof accountLink !== 'string' || accountLink.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(accountLink))) {
        throw new Error('로그인 요청을 확인하지 못했어요.');
    }
    if (accountLink !== undefined) params.set('account_link', accountLink);
    if (rememberMe !== undefined) params.set('rememberMe', String(rememberMe));
    return params.size ? `${url}?${params}` : url;
}
