/*
 * 청크 로드 오류는 세션 저장소로 간격을 제한해 한 번 새로고침한다. 저장소를 사용할 수 없거나 재오류면 오류 경계로 전달한다.
 */
const RELOAD_AT_KEY = 'reserve:chunk-reload-at';
const RELOAD_GUARD_MS = 30_000;

// 브라우저별 동적 import·CSS 사전 로드 오류를 구분한다.
const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export const isChunkLoadError = (error) => CHUNK_ERROR_PATTERN.test(String(error?.message ?? ''));

/** 가드가 허락하면 새로고침하고 true, 아니면 아무것도 하지 않고 false. */
export const reloadOnceForChunkError = (win = window, now = Date.now()) => {
    try {
        const last = Number(win.sessionStorage.getItem(RELOAD_AT_KEY));
        if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false;
        win.sessionStorage.setItem(RELOAD_AT_KEY, String(now));
    } catch {
        return false;
    }
    win.location.reload();
    return true;
};

/**
 * main.jsx 에서 한 번 설치한다. preventDefault 는 하지 않는다 — 새로고침이 막힌 경우에도
 * 오류가 lazy 컴포넌트까지 전달돼 오류 경계가 안내 화면을 그려야 하기 때문이다.
 */
export const installChunkReloadHandler = (win = window) => {
    const handler = () => { reloadOnceForChunkError(win); };
    win.addEventListener('vite:preloadError', handler);
    return () => win.removeEventListener('vite:preloadError', handler);
};
