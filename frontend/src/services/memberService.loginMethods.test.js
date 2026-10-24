import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../api/axios';
import { advanceSession } from '../api/sessionScope';
import memberService from './memberService';

const previousAdapter = api.defaults.adapter;
const previousBase = api.defaults.baseURL;
const requests = [];
beforeEach(() => {
    advanceSession();
    requests.length = 0;
    api.defaults.baseURL = 'http://api.example.test';
    // 실제 Axios의 요청·버전 변환·응답 관문을 통과하되 외부 요청은 하지 않는다.
    api.defaults.adapter = async config => {
        requests.push(config);
        const path = new URL(api.getUri(config)).pathname;
        const data = config.method === 'get' ? { memberId: 7, passwordEnabled: true, socialProvider: null }
            : path.endsWith('/oauth') ? { authorizationUrl: '/oauth2/authorization/naver?account_link=' + 'n'.repeat(43) }
                : path.endsWith('/code') ? { challengeId: 'challenge-7', expiresAt: '2026-10-22T00:05:00Z' } : null;
        return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true, data } };
    };
});
afterEach(() => {
    api.defaults.adapter = previousAdapter;
    api.defaults.baseURL = previousBase;
    vi.unstubAllEnvs();
});

it.each(['legacy', 'v1'])('routes every login-method operation through the authenticated API (%s)', async version => {
    vi.stubEnv('VITE_API_VERSION', version);
    const signal = new AbortController().signal;
    await expect(memberService.getLoginMethods(signal)).resolves.toMatchObject({ memberId: 7, passwordEnabled: true });
    await expect(memberService.beginLoginMethodOAuth(7, { provider: 'NAVER', currentPassword: 'Original123!' }))
        .resolves.toHaveProperty('authorizationUrl');
    await expect(memberService.sendLoginMethodCode(7, 'owner@example.test')).resolves.toHaveProperty('challengeId', 'challenge-7');
    await memberService.setLoginMethodPassword(7, { challengeId: 'challenge-7', code: '123456', password: 'NewPassword123!', confirmation: 'NewPassword123!' });
    await memberService.removeLoginMethodPassword(7);
    await memberService.unlinkSocialLogin(7, 'Original123!');
    await memberService.changePassword({ currentPassword: 'Original123!', newPassword: 'NewPassword123!', newPasswordConfirm: 'NewPassword123!' }, 7);

    const root = version === 'v1' ? '/api/v1/member/login-methods' : '/api/member/login-methods';
    expect(requests.map(config => [config.method, new URL(api.getUri(config)).pathname])).toEqual([
        ['get', root], ['post', `${root}/oauth`], ['post', `${root}/password/code`], ['post', `${root}/password`],
        ['delete', `${root}/password`], ['delete', `${root}/social`], ['put', `${root}/password`],
    ]);
    for (const request of requests.slice(1)) expect(request.headers.get('X-Reserve-Member-Id')).toBe('7');
    expect(JSON.parse(requests[5].data)).toEqual({ currentPassword: 'Original123!' });
});
