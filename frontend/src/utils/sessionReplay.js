import { getClient } from '@sentry/react';

// 오류·성능 수집은 main에서 바로 시작한다. DOM 재현기는 첫 화면을 그린 후 같은 출처 청크로 읽는다.
export function scheduleSessionReplay(win = window) {
    if (!import.meta.env.PROD || !import.meta.env.VITE_SENTRY_DSN) return () => {};
    let cancelled = false;
    let idleId;
    let timerId;
    const load = async () => {
        if (cancelled) return;
        const client = getClient();
        if (!client || client.getIntegrationByName('Replay')) return;
        try {
            const { replayIntegration } = await import('@sentry/replay');
            if (cancelled || getClient() !== client || client.getIntegrationByName('Replay')) return;
            client.addIntegration(replayIntegration({ maskAllText: true, blockAllMedia: true }));
        } catch {
            // 선택적 관측 청크 오류는 화면과 기본 오류 수집에 영향을 주지 않는다.
            console.warn('Session replay could not be loaded');
        }
    };
    const afterLoad = () => {
        if (cancelled) return;
        if (typeof win.requestIdleCallback === 'function') idleId = win.requestIdleCallback(load, { timeout: 3000 });
        else timerId = win.setTimeout(load, 1000);
    };
    if (win.document.readyState === 'complete') afterLoad();
    else win.addEventListener('load', afterLoad, { once: true });
    return () => {
        cancelled = true;
        win.removeEventListener('load', afterLoad);
        if (idleId !== undefined) win.cancelIdleCallback?.(idleId);
        if (timerId !== undefined) win.clearTimeout(timerId);
    };
}
