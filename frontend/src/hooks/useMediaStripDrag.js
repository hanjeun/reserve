import { useCallback, useEffect, useRef } from 'react';
import useReducedMotion from './useReducedMotion';

const scrollEnd = node => Math.max(0, node.scrollWidth - node.clientWidth);
const clamp = (node, value) => Math.max(0, Math.min(scrollEnd(node), value));
const nearest = (points, value) => points.reduce((closest, point) =>
    Math.abs(point - value) < Math.abs(closest - value) ? point : closest);
const adjacent = (points, value, forward) => {
    const start = nearest(points, value);
    return forward ? Math.min(...points.filter(point => point > start + 1), points[points.length - 1])
        : Math.max(...points.filter(point => point < start - 1), 0);
};

/** 터치 스크롤·확대는 브라우저에 맡기고 마우스 가로 드래그만 처리한다. */
export default function useMediaStripDrag(itemSelector, scrollSelector) {
    const gesture = useRef(null);
    const owner = useRef(null);
    const frame = useRef(0);
    const slide = useRef(null);
    const motionNode = useRef(null);
    const ignoreClickUntil = useRef(0);
    const reducedMotion = useReducedMotion();
    const scrollNode = wrapper => scrollSelector ? wrapper.querySelector(scrollSelector) : wrapper;
    const photoPoints = node => {
        const left = node.getBoundingClientRect().left;
        return [0, ...Array.from(node.querySelectorAll(itemSelector), item =>
            clamp(node, item.getBoundingClientRect().left - left + node.scrollLeft)), scrollEnd(node)];
    };
    const stopMotion = useCallback(() => {
        const drag = gesture.current;
        const node = drag?.node ?? motionNode.current;
        gesture.current = null;
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        slide.current = null;
        motionNode.current = null;
        if (drag?.dragging) ignoreClickUntil.current = Date.now() + 350;
        if (drag && owner.current?.hasPointerCapture?.(drag.id)) owner.current.releasePointerCapture(drag.id);
        node?.style.removeProperty('scroll-snap-type');
        node?.classList.remove('is-dragging', 'is-sliding');
    }, []);
    useEffect(() => stopMotion, [stopMotion]);
    useEffect(() => {
        if (reducedMotion && slide.current) {
            const { node, target } = slide.current;
            stopMotion();
            node.scrollLeft = target;
        }
    }, [reducedMotion, stopMotion]);

    const slideTo = (node, target) => {
        const before = node.scrollLeft;
        if (reducedMotion || Math.abs(target - before) < 1) {
            node.scrollLeft = target;
            stopMotion();
            return;
        }
        motionNode.current = node;
        node.classList.add('is-sliding');
        slide.current = { node, target };
        let start;
        const duration = Math.min(300, 180 + Math.abs(target - before) * 0.15);
        const step = now => {
            start ??= now;
            const progress = Math.min(1, (now - start) / duration);
            node.scrollLeft = before + (target - before) * (1 - (1 - progress) ** 3);
            if (progress < 1) frame.current = requestAnimationFrame(step);
            else stopMotion();
        };
        frame.current = requestAnimationFrame(step);
    };

    const finish = (event, cancelled = false) => {
        const drag = gesture.current;
        if (drag?.id !== event.pointerId) return;
        const { node } = drag;
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        gesture.current = null;
        if (owner.current?.hasPointerCapture?.(drag.id)) owner.current.releasePointerCapture(drag.id);
        if (drag.dragging) ignoreClickUntil.current = Date.now() + 350;
        if (!drag.dragging || cancelled) { stopMotion(); return; }
        node.scrollLeft = drag.target;
        const velocity = event.timeStamp - drag.time < 80 ? drag.velocity : 0;
        const projected = clamp(node, node.scrollLeft + Math.max(-node.clientWidth, Math.min(node.clientWidth, velocity * 160)));
        const points = photoPoints(node);
        node.classList.remove('is-dragging');
        slideTo(node, nearest(points, projected));
    };

    return {
        ref: owner,
        onKeyDown(event) {
            if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const node = scrollNode(event.currentTarget);
            if (!node || !scrollEnd(node)) return;
            event.preventDefault();
            stopMotion();
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? scrollEnd(node)
                : adjacent(photoPoints(node), node.scrollLeft, event.key === 'ArrowRight');
            slideTo(node, target);
        },
        onPointerDown(event) {
            stopMotion();
            if (event.isPrimary === false || event.pointerType !== 'mouse' || event.button !== 0) return;
            ignoreClickUntil.current = 0;
            const node = scrollNode(event.currentTarget);
            if (!node || !scrollEnd(node)) return;
            motionNode.current = node;
            gesture.current = { node, id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX,
                time: event.timeStamp, velocity: 0, left: node.scrollLeft, target: node.scrollLeft, dragging: false };
        },
        onPointerMove(event) {
            const drag = gesture.current;
            if (!drag || drag.id !== event.pointerId) return;
            if (event.pointerType === 'mouse' && !event.buttons) { finish(event, true); return; }
            const { node } = drag;
            const x = event.clientX - drag.x;
            if (!drag.dragging && Math.abs(x) > 8 && Math.abs(x) > Math.abs(event.clientY - drag.y)) {
                drag.dragging = true;
                node.style.scrollSnapType = 'none';
                node.classList.add('is-dragging');
                event.currentTarget.setPointerCapture?.(event.pointerId);
            }
            if (!drag.dragging) return;
            event.preventDefault();
            const elapsed = Math.max(1, event.timeStamp - drag.time);
            drag.velocity = elapsed > 80 ? 0 : 0.7 * (drag.lastX - event.clientX) / elapsed + 0.3 * drag.velocity;
            drag.lastX = event.clientX;
            drag.time = event.timeStamp;
            drag.target = clamp(node, drag.left - x);
            if (!frame.current) frame.current = requestAnimationFrame(() => {
                frame.current = 0;
                if (gesture.current === drag) node.scrollLeft = drag.target;
            });
        },
        onPointerUp: finish,
        onPointerCancel: event => finish(event, true),
        onLostPointerCapture: event => {
            // 자식의 캡처 해제는 이 영역의 드래그를 종료하지 않는다.
            if (event.target === event.currentTarget) finish(event, true);
        },
        onPointerLeave: () => { if (!gesture.current?.dragging) gesture.current = null; },
        onWheel: stopMotion,
        onDragStart: event => event.preventDefault(),
        onClickCapture(event) {
            if (event.detail && (Date.now() < ignoreClickUntil.current || gesture.current?.dragging)) {
                event.preventDefault();
                event.stopPropagation();
            }
        },
    };
}
