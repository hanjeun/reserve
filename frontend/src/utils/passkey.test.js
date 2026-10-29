import { describe, it, expect, vi, afterEach } from 'vitest';
import { performPasskey } from './passkey';
describe('패스키 브라우저 요청', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('일반 자격 증명 문자열을 저장하지 않고 WebAuthn 바이너리로 요청해요', async () => {
        const get = vi.fn().mockResolvedValue({ id: 'AQID', rawId: Uint8Array.from([1,2,3]).buffer, type: 'public-key',
            response: { clientDataJSON: new Uint8Array([1]).buffer, authenticatorData: new Uint8Array([2]).buffer,
                signature: new Uint8Array([3]).buffer, userHandle: null }, getClientExtensionResults: () => ({}) });
        vi.stubGlobal('isSecureContext', true);
        vi.stubGlobal('PublicKeyCredential', function() {});
        vi.stubGlobal('navigator', { credentials: { get } });
        const result = await performPasskey(JSON.stringify({ publicKey: { challenge: 'AQID', allowCredentials: [{ type: 'public-key', id: 'BAUG' }] } }), false);
        expect([...get.mock.calls[0][0].publicKey.challenge]).toEqual([1,2,3]);
        expect([...get.mock.calls[0][0].publicKey.allowCredentials[0].id]).toEqual([4,5,6]);
        expect(JSON.parse(result).response.userHandle).toBeNull();
    });
    it('기기와 외부 인증기의 선택을 브라우저에 맡기고 등록 응답을 전달해요', async () => {
        const create = vi.fn().mockResolvedValue({ id: 'AQID', rawId: new Uint8Array([1,2,3]).buffer, type: 'public-key',
            authenticatorAttachment: 'cross-platform', response: {
                clientDataJSON: new Uint8Array([1]).buffer, attestationObject: new Uint8Array([2]).buffer,
                getTransports: () => ['hybrid', 'usb'] }, getClientExtensionResults: () => ({}) });
        vi.stubGlobal('isSecureContext', true);
        vi.stubGlobal('PublicKeyCredential', function() {});
        vi.stubGlobal('navigator', { credentials: { create } });
        const signal = new AbortController().signal;
        const result = JSON.parse(await performPasskey(JSON.stringify({ publicKey: { challenge: 'AQID',
            user: { id: 'BAUG' }, authenticatorSelection: { residentKey: 'required', userVerification: 'required' } } }), true, signal));
        const request = create.mock.calls[0][0];
        expect(request.signal).toBe(signal);
        expect([...request.publicKey.user.id]).toEqual([4,5,6]);
        expect(request.publicKey.authenticatorSelection).not.toHaveProperty('authenticatorAttachment');
        expect(result.authenticatorAttachment).toBe('cross-platform');
        expect(result.response.transports).toEqual(['hybrid', 'usb']);
        expect(result.clientExtensionResults).toEqual({});
    });
    it('패스키 등록 API가 없는 환경에는 지원 안내를 표시해요', async () => {
        vi.stubGlobal('isSecureContext', true);
        vi.stubGlobal('PublicKeyCredential', function() {});
        vi.stubGlobal('navigator', { credentials: {} });
        await expect(performPasskey('{}', true)).rejects.toThrow('이 브라우저에서 패스키를 사용할 수 없어요.');
    });
    it('보안 출처가 아니면 자격 증명을 요청하지 않아요', async () => {
        const get = vi.fn();
        vi.stubGlobal('isSecureContext', false);
        vi.stubGlobal('navigator', { credentials: { get } });
        await expect(performPasskey('{}', false)).rejects.toThrow('이 브라우저');
        expect(get).not.toHaveBeenCalled();
    });
});
