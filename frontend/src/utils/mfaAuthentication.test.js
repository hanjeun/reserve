import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateWithPasskey, finishMfaSession } from './mfaAuthentication';
import { performPasskey } from './passkey';
import api from '../api/axios';
import { advanceSession } from '../api/sessionScope';
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
        const activeSignal = api.post.mock.calls[0][2].signal;
        expect(api.post).toHaveBeenNthCalledWith(1, '/api/auth/mfa/passkey/options', { registration }, { skipAuthRefresh: true, signal: activeSignal });
        expect(performPasskey).toHaveBeenCalledExactlyOnceWith('options', registration, activeSignal);
        expect(api.post).toHaveBeenNthCalledWith(2, registration ? '/api/auth/mfa/passkey/confirm' : '/api/auth/mfa/verify',
            registration ? { credential: 'signed-credential', name: '패스키' } : { kind: 'PASSKEY', proof: 'signed-credential' }, { skipAuthRefresh: true, signal: activeSignal });
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
    it.each([false, true])('계정이 바뀐 뒤 브라우저가 돌려준 이전 키는 새 계정에 전송하지 않아요 (%s)', async registration => {
        api.post.mockResolvedValue('options');
        performPasskey.mockImplementation(async (_options, _registration, signal) => {
            advanceSession();
            expect(signal.aborted).toBe(true);
            return 'previous-credential';
        });
        await expect(authenticateWithPasskey(registration)).rejects.toHaveProperty('isStaleSession', true);
        expect(api.post).toHaveBeenCalledTimes(1);
    });
    it('계정 전환으로 닫힌 브라우저 인증을 새 계정의 사용자 취소로 안내하지 않아요', async () => {
        api.post.mockResolvedValue('options');
        performPasskey.mockImplementation(async () => { advanceSession(); throw new DOMException('cancelled', 'NotAllowedError'); });
        await expect(authenticateWithPasskey(false)).rejects.toHaveProperty('isStaleSession', true);
        expect(api.post).toHaveBeenCalledTimes(1);
    });
    it('계정이 바뀐 늦은 옵션과 완료 응답은 다음 인증 단계로 이어지지 않아요', async () => {
        api.post.mockImplementation(async () => { advanceSession(); return 'late response'; });
        await expect(authenticateWithPasskey(false)).rejects.toHaveProperty('isStaleSession', true);
        expect(performPasskey).not.toHaveBeenCalled();
        await expect(finishMfaSession()).rejects.toHaveProperty('isStaleSession', true);
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
    it.each([['cross-platform', '다른 기기 패스키'], [null, '패스키'], ['unknown', '패스키']])('다른 기기·보안 키나 불명확한 수단을 현재 PC에 저장했다고 표시하지 않아요: %s', async (attachment, name) => {
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/136.0.0.0' });
        const credential = JSON.stringify({ authenticatorAttachment: attachment, response: { transports: ['hybrid'] } });
        api.post.mockResolvedValue('options');
        performPasskey.mockResolvedValue(credential);
        await authenticateWithPasskey(true);
        expect(api.post).toHaveBeenLastCalledWith('/api/auth/mfa/passkey/confirm', { credential, name }, expect.anything());
    });
    it('아이폰의 다른 인증 연결도 저장 위치 대신 모바일 등록 환경으로 표시해요', async () => {
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/136.0.0.0 Mobile/15E148 Safari/604.1' });
        const credential = JSON.stringify({ authenticatorAttachment: 'cross-platform' });
        api.post.mockResolvedValue('options'); performPasskey.mockResolvedValue(credential);
        await authenticateWithPasskey(true);
        expect(api.post).toHaveBeenLastCalledWith('/api/auth/mfa/passkey/confirm', { credential, name: '모바일 · Chrome에서 등록' }, expect.anything());
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

describe('인증 완료의 응답 복구', () => {
    beforeEach(() => vi.resetAllMocks());
    it('세션 발급 뒤 회원 조회만 실패하면 발급을 반복하지 않고 조회만 다시 해요', async () => {
        const completion = { reference: 'a'.repeat(64) };
        api.post.mockResolvedValue(null);
        api.get.mockRejectedValueOnce(new Error('read unavailable')).mockResolvedValueOnce({ id: 7 });
        await expect(finishMfaSession(undefined, false, completion)).rejects.toThrow('read unavailable');
        await expect(finishMfaSession(undefined, false, completion)).resolves.toEqual({ id: 7 });
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledTimes(2);
    });
    it('발급 응답이 끊기면 서버가 같은 요청의 현재 세션임을 확인한 경우에만 이어가요', async () => {
        const completion = { reference: 'a'.repeat(64) };
        api.post.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(null);
        api.get.mockResolvedValue({ id: 7 });
        await expect(finishMfaSession(undefined, false, completion)).resolves.toEqual({ id: 7 });
        expect(api.post.mock.calls.map(([path]) => path)).toEqual(['/api/auth/mfa/finish', '/api/auth/mfa/completion']);
        expect(api.post.mock.calls[1][1]).toEqual({ completionId: completion.reference });
        expect(completion.issued).toBe(true);
    });
    it('같은 요청의 발급을 확인하지 못하면 완료로 표시하거나 회원을 조회하지 않아요', async () => {
        const completion = { reference: 'a'.repeat(64) };
        api.post.mockRejectedValueOnce(new Error('response lost')).mockRejectedValueOnce(new Error('not this session'));
        await expect(finishMfaSession(undefined, false, completion)).rejects.toThrow('response lost');
        expect(completion.issued).not.toBe(true);
        expect(api.get).not.toHaveBeenCalled();
    });
    it('계정 전환 뒤의 발급 응답은 완료로 표시하거나 다른 계정을 조회하지 않아요', async () => {
        const completion = { reference: 'a'.repeat(64) };
        api.post.mockImplementationOnce(async () => { advanceSession(); return null; });
        await expect(finishMfaSession(undefined, false, completion)).rejects.toHaveProperty('isStaleSession', true);
        expect(completion.issued).not.toBe(true);
        expect(api.get).not.toHaveBeenCalled();
        expect(api.post).toHaveBeenCalledTimes(1);
    });
    it('이전 계정의 완료 상태는 새 계정에서 재시도할 수 없어요', async () => {
        const completion = { reference: 'a'.repeat(64) };
        api.post.mockResolvedValue(null); api.get.mockResolvedValue({ id: 7 });
        await finishMfaSession(undefined, false, completion);
        advanceSession();
        api.get.mockClear();
        await expect(finishMfaSession(undefined, false, completion)).rejects.toHaveProperty('isStaleSession', true);
        expect(api.get).not.toHaveBeenCalled();
    });
});
