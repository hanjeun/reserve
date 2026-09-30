import { describe, expect, it, vi } from 'vitest';
import { installChunkReloadHandler, isChunkLoadError, reloadOnceForChunkError } from '../chunkReload';

const fakeWindow = (storage = new Map()) => {
    const target = new EventTarget();
    return {
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
        location: { reload: vi.fn() },
        sessionStorage: {
            getItem: key => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => { storage.set(key, value); },
        },
    };
};

describe('stale chunk reload guard', () => {
    it('recognises dynamic import failures across browsers but not ordinary render errors', () => {
        expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/a-1234abcd.js'))).toBe(true);
        expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
        expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
        expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/a-1234abcd.css'))).toBe(true);
        expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
        expect(isChunkLoadError(undefined)).toBe(false);
    });

    it('reloads once on vite:preloadError and not again inside the guard window', () => {
        const win = fakeWindow();
        const uninstall = installChunkReloadHandler(win);

        win.dispatchEvent(new Event('vite:preloadError'));
        win.dispatchEvent(new Event('vite:preloadError'));
        expect(win.location.reload).toHaveBeenCalledOnce();

        uninstall();
        win.dispatchEvent(new Event('vite:preloadError'));
        expect(win.location.reload).toHaveBeenCalledOnce();
    });

    it('allows another reload after the guard window passes', () => {
        const win = fakeWindow();
        expect(reloadOnceForChunkError(win, 1_000_000)).toBe(true);
        expect(reloadOnceForChunkError(win, 1_010_000)).toBe(false);
        expect(reloadOnceForChunkError(win, 1_040_000)).toBe(true);
        expect(win.location.reload).toHaveBeenCalledTimes(2);
    });

    it('does not auto-reload when session storage is unavailable, so it can never loop', () => {
        const win = fakeWindow();
        win.sessionStorage.getItem = () => { throw new DOMException('blocked', 'SecurityError'); };
        expect(reloadOnceForChunkError(win)).toBe(false);
        expect(win.location.reload).not.toHaveBeenCalled();
    });
});
