// 스토어를 가져오기 전에 실제 브라우저 저장소와 분리한다.
const memoryStorage = () => {
    const values = new Map();
    return {
        get length() { return values.size; },
        key: index => [...values.keys()][index] ?? null,
        getItem: key => values.get(String(key)) ?? null,
        setItem: (key, value) => values.set(String(key), String(value)),
        removeItem: key => values.delete(String(key)),
        clear: () => values.clear(),
    };
};

try {
    if (globalThis.parent === globalThis || globalThis.origin !== 'null') throw new Error('Preview isolation is required');
    for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true });
    localStorage.setItem('reserve:theme', 'light');
    localStorage.setItem('reserve:font', 'pretendard');
    localStorage.setItem('reserve:accent', 'blue');
    globalThis.__RESERVE_PREVIEW_ISOLATED__ = true;
} catch {
    globalThis.__RESERVE_PREVIEW_ISOLATED__ = false;
}

const unavailable = () => {
    document.getElementById('root').textContent = '이 환경에서는 미리보기를 열 수 없어요.';
    if (globalThis.origin === 'null' && globalThis.parent !== globalThis) {
        globalThis.parent.postMessage({ type: 'reserve:service-preview:unavailable' }, new URL(document.baseURI).origin);
    }
};
if (globalThis.__RESERVE_PREVIEW_ISOLATED__ === true) {
    const renderer = document.createElement('script');
    renderer.src = document.currentScript.dataset.renderer;
    renderer.onerror = unavailable;
    document.head.append(renderer);
} else unavailable();
