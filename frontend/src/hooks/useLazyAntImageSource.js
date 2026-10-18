import { useEffect, useId, useMemo, useState } from 'react';

const CLIPPED_OVERFLOW = /^(auto|scroll|hidden|clip)$/;
const VERTICAL_MARGIN = 240;

function nearViewport(node, view) {
    const rect = node.getBoundingClientRect();
    let top = -VERTICAL_MARGIN;
    let bottom = view.innerHeight + VERTICAL_MARGIN;
    let left = 0;
    let right = view.innerWidth;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = view.getComputedStyle(parent);
        const bounds = parent.getBoundingClientRect();
        if (CLIPPED_OVERFLOW.test(style.overflowX)) {
            left = Math.max(left, bounds.left);
            right = Math.min(right, bounds.right);
        }
        if (CLIPPED_OVERFLOW.test(style.overflowY)) {
            top = Math.max(top, bounds.top);
            bottom = Math.min(bottom, bounds.bottom);
        }
    }
    return rect.width > 0 && rect.height > 0 && bottom > top && right > left
        && rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < right;
}

/** AntD 사전 검증도 실제 viewport와 가로 스크롤 영역에 닿기 전에는 원본 주소를 받지 않는다. */
export default function useLazyAntImageSource(sourceKey, enabled) {
    const id = useId();
    const rootClassName = `reserve-lazy-image-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const source = useMemo(() => ({ key: sourceKey }), [sourceKey]);
    const [admitted, setAdmitted] = useState(null);
    const ready = !enabled || admitted === source;
    useEffect(() => {
        if (ready) return undefined;
        // src 없는 AntD Image는 ref를 전달하지 않는 Progress 루트로 렌더된다.
        // 고유 클래스만 추가해 기존 루트를 관찰하고 레이아웃 래퍼는 만들지 않는다.
        const node = document.getElementsByClassName(rootClassName)[0];
        if (!node) return undefined;
        const page = node.ownerDocument;
        const view = page.defaultView;
        let alive = true;
        let frame;
        const admit = () => {
            if (alive && page.visibilityState !== 'hidden') setAdmitted(source);
        };
        const measure = () => { if (nearViewport(node, view)) admit(); };
        const schedule = () => {
            if (frame != null) return;
            frame = view.requestAnimationFrame(() => { frame = undefined; measure(); });
        };
        const observer = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver(entries => {
            if (entries.some(entry => entry.target === node && entry.isIntersecting)) admit();
        }, { root: null, rootMargin: `${VERTICAL_MARGIN}px 0px`, threshold: 0 }) : null;
        if (observer) observer.observe(node);
        else measure();
        const visibilityChanged = () => { if (page.visibilityState !== 'hidden') measure(); };
        page.addEventListener('visibilitychange', visibilityChanged);
        if (!observer) {
            page.addEventListener('scroll', schedule, { capture: true, passive: true });
            view.addEventListener('resize', schedule, { passive: true });
        }
        return () => {
            alive = false;
            observer?.disconnect();
            if (frame != null) view.cancelAnimationFrame(frame);
            page.removeEventListener('visibilitychange', visibilityChanged);
            if (!observer) {
                page.removeEventListener('scroll', schedule, true);
                view.removeEventListener('resize', schedule);
            }
        };
    }, [ready, source, rootClassName]);
    return { ready, rootClassName: enabled ? rootClassName : undefined };
}
