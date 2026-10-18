import { useCallback, useEffect, useRef, useState } from 'react';

// 암호화 사진은 브라우저 native lazy 대신 실제 대화 스크롤 영역 가까이에서만 요청한다.
const PREFETCH_MARGIN = 240;

function scrollRoot(node, view) {
    const thread = node.closest('.reserve-messenger-thread-body');
    if (thread) return thread;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll)/.test(view.getComputedStyle(parent).overflowY)) return parent;
    }
    return null;
}

function nearViewport(node, root, view) {
    const rect = node.getBoundingClientRect();
    const bounds = root?.getBoundingClientRect();
    const top = Math.max(0, bounds?.top ?? 0);
    const bottom = Math.min(view.innerHeight, bounds?.bottom ?? view.innerHeight);
    const left = Math.max(0, bounds?.left ?? 0);
    const right = Math.min(view.innerWidth, bounds?.right ?? view.innerWidth);
    return rect.width > 0 && rect.height > 0 && bottom > top && right > left
        && rect.bottom > top - PREFETCH_MARGIN && rect.top < bottom + PREFETCH_MARGIN
        && rect.right > left && rect.left < right;
}

/** 사진 틀은 그대로 두고 실제 scrollport와 탭 가시성만 관찰한다. */
export default function useChatImageVisibility(scope) {
    const [node, frameRef] = useState(null);
    const [visible, setVisible] = useState(null);
    const eligibility = useRef(null);
    useEffect(() => {
        if (!node) return undefined;
        const page = node.ownerDocument;
        const view = page.defaultView;
        const root = scrollRoot(node, view);
        let alive = true;
        let frame;
        const commit = near => {
            if (!alive) return;
            const next = { scope, node, near: near && page.visibilityState !== 'hidden' };
            eligibility.current = next;
            setVisible(previous => previous?.scope === scope && previous.node === node && previous.near === next.near
                ? previous : next);
        };
        const measure = () => commit(nearViewport(node, root, view));
        const schedule = () => {
            if (frame != null) return;
            frame = view.requestAnimationFrame(() => { frame = undefined; measure(); });
        };
        const observer = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver(entries => {
            const entry = entries.find(candidate => candidate.target === node);
            if (entry) commit(entry.isIntersecting);
        }, { root, rootMargin: `${PREFETCH_MARGIN}px 0px`, threshold: 0 }) : null;
        if (observer) observer.observe(node);
        else measure();
        const visibilityChanged = () => {
            if (page.visibilityState === 'hidden') commit(false);
            else measure();
        };
        page.addEventListener('visibilitychange', visibilityChanged);
        // IO가 없는 환경도 화면 밖 사진 전체를 즉시 읽지 않는다.
        if (!observer) {
            page.addEventListener('scroll', schedule, { capture: true, passive: true });
            view.addEventListener('resize', schedule, { passive: true });
        }
        return () => {
            alive = false;
            if (eligibility.current?.node === node && eligibility.current.scope === scope) eligibility.current = null;
            observer?.disconnect();
            if (frame != null) view.cancelAnimationFrame(frame);
            page.removeEventListener('visibilitychange', visibilityChanged);
            if (!observer) {
                page.removeEventListener('scroll', schedule, true);
                view.removeEventListener('resize', schedule);
            }
        };
    }, [node, scope]);
    const canLoad = useCallback(() => eligibility.current?.scope === scope && eligibility.current.near
        && eligibility.current.node.ownerDocument.visibilityState !== 'hidden', [scope]);
    return { frameRef, near: visible?.scope === scope && visible.node === node && visible.near, canLoad };
}
