import { afterEach, expect, it, vi } from 'vitest';

const nonce = 'a'.repeat(43);
const load = async baseUrl => {
    vi.stubEnv('VITE_API_BASE_URL', baseUrl);
    vi.resetModules();
    return (await import('./oauthAuthorization')).oauthAuthorizationUrl;
};
afterEach(() => vi.unstubAllEnvs());

it.each([
    ['http://localhost:8080', 'http://localhost:8080'],
    ['https://app.reserve.it.kr/', 'https://app.reserve.it.kr'],
    ['', ''],
])('uses the same configured origin for login, linking and proof with %s', async (baseUrl, expectedBase) => {
    const authorizationUrl = await load(baseUrl);
    for (const provider of ['google', 'naver', 'kakao']) {
        const expected = `${expectedBase}/oauth2/authorization/${provider}`;
        expect(authorizationUrl(provider)).toBe(expected);
        expect(authorizationUrl(provider.toUpperCase(), nonce)).toBe(`${expected}?account_link=${nonce}`);
    }
});

it.each([false, true])('keeps the login preference on the application authorization URL (%s)', async rememberMe => {
    const authorizationUrl = await load('https://app.reserve.it.kr');
    expect(authorizationUrl('google', undefined, rememberMe)).toBe('https://app.reserve.it.kr/oauth2/authorization/google?rememberMe=' + rememberMe);
    expect(() => authorizationUrl('google', undefined, 'true')).toThrow('로그인 유지 선택을 확인해주세요.');
});

it('does not turn an unexpected provider or malformed challenge into a browser destination', async () => {
    const authorizationUrl = await load('http://localhost:8080');
    for (const provider of ['https://other.example', '../google', '__proto__', null, {}]) {
        expect(() => authorizationUrl(provider, nonce)).toThrow('로그인 제공자를 확인하지 못했어요.');
    }
    for (const value of ['', null, {}, 'a'.repeat(42), 'a'.repeat(44), `${nonce}\n`, `${nonce}&next=other`, `${'a'.repeat(42)}%`]) {
        expect(() => authorizationUrl('GOOGLE', value)).toThrow('로그인 요청을 확인하지 못했어요.');
    }
});
