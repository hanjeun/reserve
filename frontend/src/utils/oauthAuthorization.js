import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';

/** Start every OAuth flow on the API origin so its registered callback stays the same. */
export function oauthAuthorizationUrl(provider, accountLink) {
    const key = typeof provider === 'string' ? provider.toUpperCase() : '';
    if (!Object.hasOwn(API_ENDPOINTS.OAUTH, key)) throw new Error('로그인 제공자를 확인하지 못했어요.');
    const url = `${(API_BASE_URL || '').replace(/\/+$/, '')}${API_ENDPOINTS.OAUTH[key]}`;
    if (accountLink === undefined) return url;
    if (typeof accountLink !== 'string' || accountLink.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(accountLink)) {
        throw new Error('로그인 요청을 확인하지 못했어요.');
    }
    return `${url}?account_link=${accountLink}`;
}
