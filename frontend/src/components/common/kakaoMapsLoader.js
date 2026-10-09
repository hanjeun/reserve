const SCRIPT_ID = 'reserve-kakao-maps-sdk';
const SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js';
const LOAD_TIMEOUT_MS = 10000;

let sdkPromise = null;

const sdkIsReady = () => typeof globalThis.kakao?.maps?.load === 'function';

const waitForMaps = (resolve, reject, onSettled) => {
    try {
        globalThis.kakao.maps.load(() => {
            onSettled();
            resolve(globalThis.kakao);
        });
    } catch {
        onSettled();
        reject(new Error('카카오맵 SDK를 초기화하지 못했어요.'));
    }
};

/** 카카오맵 Web SDK를 실제 지도 진입 시 한 번만 불러온다. */
export const loadKakaoMapsSdk = () => {
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise((resolve, reject) => {
        if (typeof document === 'undefined') {
            reject(new Error('브라우저에서만 지도를 불러올 수 있어요.'));
            return;
        }

        const appKey = import.meta.env.VITE_KAKAO_JS_KEY?.trim();
        if (!appKey) {
            reject(new Error('카카오맵 JavaScript 키가 설정되지 않았어요.'));
            return;
        }

        let script = document.getElementById(SCRIPT_ID);
        let settled = false;
        const timeout = globalThis.setTimeout(() => fail(), LOAD_TIMEOUT_MS);
        const cleanup = () => {
            globalThis.clearTimeout(timeout);
            script?.removeEventListener('load', handleLoad);
            script?.removeEventListener('error', fail);
        };
        const finish = () => {
            if (settled) return;
            settled = true;
            cleanup();
        };
        const fail = () => {
            if (settled) return;
            finish();
            script?.remove();
            sdkPromise = null;
            reject(new Error('카카오맵 SDK를 불러오지 못했어요.'));
        };
        const handleLoad = () => {
            if (!sdkIsReady()) {
                fail();
                return;
            }
            waitForMaps(resolve, reject, finish);
        };

        if (sdkIsReady()) {
            waitForMaps(resolve, reject, finish);
            return;
        }

        if (!script) {
            script = document.createElement('script');
            script.id = SCRIPT_ID;
            script.src = `${SDK_URL}?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services`;
            script.async = true;
        }
        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', fail, { once: true });
        if (!script.isConnected) document.head.appendChild(script);
    });

    // 설정 누락도 나중에 환경이 보완된 뒤 재시도할 수 있어야 한다.
    sdkPromise.catch(() => { sdkPromise = null; });
    return sdkPromise;
};
