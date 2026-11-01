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
        expect(get.mock.calls[0][0].publicKey).not.toHaveProperty('hints');
        expect(JSON.parse(result).response.userHandle).toBeNull();
    });
    it.each([undefined, ['security-key']])('현재 기기를 우선 제안하되 서버 힌트와 외부 인증기 선택을 유지해요 (%j)', async hints => {
        const create = vi.fn().mockResolvedValue({ id: 'AQID', rawId: new Uint8Array([1,2,3]).buffer, type: 'public-key',
            authenticatorAttachment: 'cross-platform', response: {
                clientDataJSON: new Uint8Array([1]).buffer, attestationObject: new Uint8Array([2]).buffer,
                getTransports: () => ['hybrid', 'usb'] }, getClientExtensionResults: () => ({}) });
        vi.stubGlobal('isSecureContext', true);
        vi.stubGlobal('PublicKeyCredential', function() {});
        vi.stubGlobal('navigator', { credentials: { create } });
        const signal = new AbortController().signal;
        const result = JSON.parse(await performPasskey(JSON.stringify({ publicKey: { challenge: 'AQID',
            user: { id: 'BAUG' }, hints, authenticatorSelection: { residentKey: 'required', userVerification: 'required' } } }), true, signal));
        const request = create.mock.calls[0][0];
        expect(request.signal).toBe(signal);
        expect([...request.publicKey.user.id]).toEqual([4,5,6]);
        expect(request.publicKey.authenticatorSelection).not.toHaveProperty('authenticatorAttachment');
        expect(request.publicKey.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
        expect(request.publicKey.hints).toEqual(hints ?? ['client-device']);
        expect(result.authenticatorAttachment).toBe('cross-platform');
        expect(result.response.transports).toEqual(['hybrid', 'usb']);
        expect(result.clientExtensionResults).toEqual({});
    });
    it.each([false, true])('중복 등록은 설명하되 제외 목록과 인증 오류를 그대로 유지해요 (%s)', async registration => {
        const failure = new DOMException('already registered', 'InvalidStateError');
        const operation = vi.fn().mockRejectedValue(failure);
        vi.stubGlobal('isSecureContext', true);
        vi.stubGlobal('PublicKeyCredential', function() {});
        vi.stubGlobal('navigator', { credentials: { create: operation, get: operation } });
        const signal = new AbortController().signal;
        const pending = performPasskey(JSON.stringify({ publicKey: { challenge: 'AQID', user: { id: 'BAUG' },
            excludeCredentials: [{ type: 'public-key', id: 'BAUG' }] } }), registration, signal);
        if (registration) await expect(pending).rejects.toMatchObject({ name: 'InvalidStateError',
            message: '이미 등록된 패스키예요. 기존 키를 사용하거나 다른 저장 위치를 선택해주세요.' });
        else await expect(pending).rejects.toBe(failure);
        expect(operation).toHaveBeenCalledOnce();
        expect(operation.mock.calls[0][0].signal).toBe(signal);
        expect([...operation.mock.calls[0][0].publicKey.excludeCredentials[0].id]).toEqual([4, 5, 6]);
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
