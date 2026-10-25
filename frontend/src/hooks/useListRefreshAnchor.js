import { useLayoutEffect, useRef } from 'react';

const scrollPort = node => {
    for (let parent = node; parent && parent !== document.body; parent = parent.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
    }
    return window;
};
const bounds = port => {
    if (port === window) return { top: 64, bottom: window.innerHeight };
    const rect = port.getBoundingClientRect();
    return { top: Math.max(0, rect.top + port.clientTop), bottom: Math.min(window.innerHeight, rect.top + port.clientTop + port.clientHeight) };
};

/* 백그라운드 조회·늦은 이미지 로딩 뒤에도 보이는 행의 위치를 유지한다. */
export default function useListRefreshAnchor(container, key, refreshing, data) {
    const snapshot = useRef(null);
    const navigation = useRef({ key, pending: false });
    const cycle = useRef({ fetching: false, interrupted: false });
    const watching = useRef(null);
    const stopWatching = () => {
        if (!watching.current) return;
        watching.current.observer?.disconnect();
        clearTimeout(watching.current.timer);
        cancelAnimationFrame(watching.current.frame);
        watching.current = null;
    };
    const restore = () => {
        const previous = snapshot.current;
        if (!previous || !container.current || previous.key !== key) return;
        if (previous.port !== window && !previous.port.isConnected) return;
        const current = new Map(Array.from(container.current.querySelectorAll('[data-list-item-id]'))
            .map(row => [row.dataset.listItemId, row]));
        // 첫 행이 삭제되면 다음으로 남은 보이는 행을 기준으로 삼는다.
        const anchor = previous.rows.find(row => current.has(row.id));
        if (!anchor) return;
        const delta = current.get(anchor.id).getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta) <= 1) return;
        if (previous.port === window) window.scrollBy({ top: delta, behavior: 'instant' });
        else previous.port.scrollTop += delta;
    };
    useLayoutEffect(() => {
        if (refreshing && !cycle.current.fetching) cycle.current.interrupted = false;
        cycle.current.fetching = refreshing;
        if (navigation.current.key !== key) {
            navigation.current = { key, pending: true };
            snapshot.current = null; stopWatching();
        }
        if (navigation.current.pending) {
            if (!refreshing) navigation.current.pending = false;
            return;
        }
        if (refreshing && data && !cycle.current.interrupted && !snapshot.current && container.current) {
            stopWatching();
            const port = scrollPort(container.current);
            const viewport = bounds(port);
            const rows = Array.from(container.current.querySelectorAll('[data-list-item-id]'))
                .map(row => { const rect = row.getBoundingClientRect(); return { id: row.dataset.listItemId, top: rect.top, bottom: rect.bottom }; })
                .filter(row => row.bottom > viewport.top && row.top < viewport.bottom)
                .map(({ id, top }) => ({ id, top }));
            if (rows.length) snapshot.current = { key, port, rows };
        }
        if (!refreshing && snapshot.current && container.current) {
            restore(); stopWatching();
            const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(restore);
            observer?.observe(container.current);
            const frame = requestAnimationFrame(restore);
            const timer = setTimeout(() => { stopWatching(); snapshot.current = null; }, 3_000);
            watching.current = { observer, frame, timer };
        }
    });
    useLayoutEffect(() => {
        const interrupt = () => { cycle.current.interrupted = true; snapshot.current = null; stopWatching(); };
        const keydown = event => {
            if (['PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp', ' ', 'Tab'].includes(event.key)) interrupt();
        };
        window.addEventListener('wheel', interrupt, { passive: true });
        window.addEventListener('touchstart', interrupt, { passive: true });
        window.addEventListener('pointerdown', interrupt, { passive: true });
        window.addEventListener('keydown', keydown);
        return () => {
            stopWatching(); snapshot.current = null;
            window.removeEventListener('wheel', interrupt);
            window.removeEventListener('touchstart', interrupt);
            window.removeEventListener('pointerdown', interrupt);
            window.removeEventListener('keydown', keydown);
        };
    }, []);
}
