/**
 * 배포 뒤 오래 열려 있던 탭이 옛 라우트 청크를 받지 못하는 경우의 복구.
 *
 * 평소에는 거의 일어나지 않는다 — 배포 스크립트(scripts/preserve-frontend-assets.sh)가 현재 판과
 * 직전 판의 해시 자산을 새 판에 함께 남겨 두기 때문이다. 그래도 두 번 넘게 배포가 지나간 탭,
 * 받는 도중 끊긴 네트워크에서는 lazy import 가 실패한다. 그때 Vite 가 window 에
 * 'vite:preloadError' 를 보내므로 한 번만 새로고침해 새 index.html 과 청크를 받게 한다.
 *
 * 무한 새로고침 방지: 마지막 새로고침 시각을 sessionStorage 에 적고, 짧은 시간 안에 또 실패하면
 * 새로고침하지 않고 오류를 그대로 흘려 오류 경계 화면(새로고침 버튼)이 보이게 한다.
 * 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 횟수를 셀 수 없으니 자동 새로고침을 하지 않는다.
 */
const RELOAD_AT_KEY = 'reserve:chunk-reload-at';
const RELOAD_GUARD_MS = 30_000;

// 브라우저마다 동적 import 실패 문구가 다르다(Chrome / Firefox / Safari / Vite CSS 선로딩).
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
