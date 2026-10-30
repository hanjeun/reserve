import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateWithPasskey, finishMfaSession } from './mfaAuthentication';
import { performPasskey } from './passkey';
import api from '../api/axios';
vi.mock('../api/axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock('./passkey', () => ({ performPasskey: vi.fn() }));
describe('브라우저 패스키 인계', () => {
    beforeEach(() => { vi.resetAllMocks(); });
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
    it('브라우저 선택을 취소하면 검증 요청을 보내지 않아요', async () => {
        api.post.mockResolvedValue('options');
        performPasskey.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'));
        await expect(authenticateWithPasskey(false)).rejects.toHaveProperty('name', 'NotAllowedError');
        expect(api.post).toHaveBeenCalledTimes(1);
    });
    it('완료 실패는 본인 정보 조회와 로그인 완료로 이어지지 않아요', async () => {
        api.post.mockRejectedValue(new Error('expired'));
        await expect(finishMfaSession()).rejects.toThrow('expired');
        expect(api.get).not.toHaveBeenCalled();
    });
});
