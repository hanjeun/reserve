import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateWithPasskey, finishMfaSession } from './mfaAuthentication';
import { performPasskey } from './passkey';
import api from '../api/axios';
vi.mock('../api/axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock('./passkey', () => ({ performPasskey: vi.fn() }));
describe('브라우저 패스키 인계', () => {
    beforeEach(() => { vi.resetAllMocks(); });
    afterEach(() => vi.unstubAllGlobals());
    it.each([false, true])('브라우저 응답만 검증 경로로 전달해요 (%s)', async registration => {
        const signal = new AbortController().signal;
        api.post.mockResolvedValueOnce('options').mockResolvedValueOnce({ verified: true });
        performPasskey.mockResolvedValue('signed-credential');
        await authenticateWithPasskey(registration, signal);
        expect(api.post).toHaveBeenNthCalledWith(1, '/api/auth/mfa/passkey/options', { registration }, { skipAuthRefresh: true, signal });
        expect(performPasskey).toHaveBeenCalledExactlyOnceWith('options', registration, signal);
        expect(api.post).toHaveBeenNthCalledWith(2, registration ? '/api/auth/mfa/passkey/confirm' : '/api/auth/mfa/verify',
            registration ? { credential: 'signed-credential', name: '패스키' } : { kind: 'PASSKEY', proof: 'signed-credential' }, { skipAuthRefresh: true, signal });
    });
    it('화면이 닫히면 늦은 옵션 응답으로 브라우저 선택창을 열지 않아요', async () => {
        const controller = new AbortController();
        api.post.mockImplementationOnce(async () => { controller.abort(); return 'options'; });
        await expect(authenticateWithPasskey(false, controller.signal)).rejects.toHaveProperty('name', 'AbortError');
        expect(performPasskey).not.toHaveBeenCalled();
    });
    it.each([[false, 'NotAllowedError'], [true, 'InvalidStateError']])('브라우저 취소·중복 등록은 검증 요청을 보내지 않아요 (%s, %s)', async (registration, name) => {
        api.post.mockResolvedValue('options');
        performPasskey.mockRejectedValue(new DOMException('not created', name));
        await expect(authenticateWithPasskey(registration)).rejects.toHaveProperty('name', name);
        expect(api.post).toHaveBeenCalledTimes(1);
    });
    it('완료 실패는 본인 정보 조회와 로그인 완료로 이어지지 않아요', async () => {
        api.post.mockRejectedValue(new Error('expired'));
        await expect(finishMfaSession()).rejects.toThrow('expired');
        expect(api.get).not.toHaveBeenCalled();
    });
    it.each([
        ['PC · Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/136.0.0.0 Safari/537.36', {}],
        ['모바일 · Chrome', 'Mozilla/5.0 (Linux; Android 10; K) Chrome/136.0.0.0 Mobile Safari/537.36', {}],
        ['모바일 · Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/136.0.0.0 Mobile Safari/604.1', {}],
        ['모바일 · Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15', { maxTouchPoints: 5 }],
        ['PC · Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15', { maxTouchPoints: 0 }],
        ['PC · Edge', 'Mozilla/5.0 (Windows NT 10.0) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0', {}],
        ['모바일 · Samsung Internet', 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/28.0 Chrome/136.0.0.0 Mobile Safari/537.36', {}],
        ['모바일 · Chrome', '', { userAgentData: { mobile: false, platform: 'Android', brands: [{ brand: 'Google Chrome' }] } }],
        ['PC · Chrome', '', { userAgentData: { mobile: false, platform: 'Windows', brands: [{ brand: 'Not A Brand' }, { brand: 'Google Chrome' }] } }],
        ['모바일 패스키', '', { userAgentData: { mobile: true } }],
        ['패스키', '', {}],
    ])('새 플랫폼 패스키에 확인 가능한 등록 환경만 자동 저장해요: %s', async (name, ua, environment) => {
        vi.stubGlobal('navigator', { userAgent: ua, ...environment });
        const credential = JSON.stringify({ authenticatorAttachment: 'platform', response: { attestationObject: 'synthetic' } });
        api.post.mockResolvedValueOnce('options').mockResolvedValueOnce({ codes: [] });
        performPasskey.mockResolvedValue(credential);
        await authenticateWithPasskey(true);
        expect(api.post).toHaveBeenLastCalledWith('/api/auth/mfa/passkey/confirm', { credential, name }, expect.anything());
    });
    it.each([['cross-platform', '외부 패스키'], [null, '패스키'], ['unknown', '패스키']])('다른 기기·보안 키나 불명확한 수단을 현재 PC에 저장했다고 표시하지 않아요: %s', async (attachment, name) => {
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/136.0.0.0' });
        const credential = JSON.stringify({ authenticatorAttachment: attachment, response: { transports: ['hybrid'] } });
        api.post.mockResolvedValue('options');
        performPasskey.mockResolvedValue(credential);
        await authenticateWithPasskey(true);
        expect(api.post).toHaveBeenLastCalledWith('/api/auth/mfa/passkey/confirm', { credential, name }, expect.anything());
    });
    it('기기 표시 정보를 읽지 못해도 유효한 등록 응답 전달을 막지 않아요', async () => {
        vi.stubGlobal('navigator', { get userAgent() { throw new Error('environment unavailable'); } });
        const credential = JSON.stringify({ authenticatorAttachment: 'platform' });
        api.post.mockResolvedValue('options');
        performPasskey.mockResolvedValue(credential);
        await authenticateWithPasskey(true);
        expect(api.post).toHaveBeenLastCalledWith('/api/auth/mfa/passkey/confirm', { credential, name: '패스키' }, expect.anything());
    });
});
