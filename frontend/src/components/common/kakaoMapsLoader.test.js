import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadFreshModule = async () => {
    vi.resetModules();
    return import('./kakaoMapsLoader');
};

describe('Kakao Maps SDK loader', () => {
    beforeEach(() => {
        document.getElementById('reserve-kakao-maps-sdk')?.remove();
        delete globalThis.kakao;
        vi.stubEnv('VITE_KAKAO_JS_KEY', 'test-javascript-key');
    });

    afterEach(() => {
        document.getElementById('reserve-kakao-maps-sdk')?.remove();
        delete globalThis.kakao;
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('loads the Web SDK over HTTPS once and waits for maps.load', async () => {
        const { loadKakaoMapsSdk } = await loadFreshModule();
        const first = loadKakaoMapsSdk();
        const second = loadKakaoMapsSdk();
        const script = document.getElementById('reserve-kakao-maps-sdk');

        expect(second).toBe(first);
        expect(script).not.toBeNull();
        expect(script.src).toMatch(/^https:\/\/dapi\.kakao\.com\/v2\/maps\/sdk\.js\?/);
        expect(script.src).toContain('autoload=false');
        expect(script.src).toContain('libraries=services');

        const load = vi.fn(callback => callback());
        globalThis.kakao = { maps: { load } };
        script.dispatchEvent(new Event('load'));

        await expect(first).resolves.toBe(globalThis.kakao);
        expect(load).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('#reserve-kakao-maps-sdk')).toHaveLength(1);
    });

    it('fails clearly without a JavaScript key instead of leaving an endless skeleton', async () => {
        vi.stubEnv('VITE_KAKAO_JS_KEY', '');
        const { loadKakaoMapsSdk } = await loadFreshModule();

        await expect(loadKakaoMapsSdk()).rejects.toThrow('JavaScript 키가 설정되지 않았어요');
        expect(document.getElementById('reserve-kakao-maps-sdk')).toBeNull();
    });

    it('removes a failed script so retry can create a fresh request', async () => {
        const { loadKakaoMapsSdk } = await loadFreshModule();
        const first = loadKakaoMapsSdk();
        const failedScript = document.getElementById('reserve-kakao-maps-sdk');
        failedScript.dispatchEvent(new Event('error'));
        await expect(first).rejects.toThrow('SDK를 불러오지 못했어요');

        const second = loadKakaoMapsSdk();
        const retryScript = document.getElementById('reserve-kakao-maps-sdk');
        expect(retryScript).not.toBe(failedScript);

        globalThis.kakao = { maps: { load: callback => callback() } };
        retryScript.dispatchEvent(new Event('load'));
        await expect(second).resolves.toBe(globalThis.kakao);
    });
});
