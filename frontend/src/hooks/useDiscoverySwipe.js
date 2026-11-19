import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DISCOVERY_NAV_ITEMS, isDiscoveryRootPath } from '../constants/discovery';
import { discoveryPath, discoveryTabDestination, discoveryTabMotion, rememberDiscoveryLocation } from '../utils/discoveryNavigation';

const EDGE_PX = 24;
const AXIS_LOCK_PX = 10;
const TOUCH_LOCK_PX = 22;
const SETTLE_MS = 180;
const DRAGGING = 'reserve-discovery-swipe-dragging';
const SETTLING = 'reserve-discovery-swipe-settling';
const OFFSET = '--reserve-discovery-swipe-x';
const SWIPE_LINKS = 'a:is(.reserve-store-card-hit, .reserve-store-list-row-link, .reserve-discovery-shortcut)[href]';
const PROTECTED_TARGETS = [
    'button', 'input', 'textarea', 'select', 'label', '[contenteditable]:not([contenteditable="false"])',
    '[role="button"]', '[role="textbox"]', '[role="combobox"]', '[role="slider"]',
    '[role="dialog"]', '[role="grid"]', '[role="gridcell"]', '[data-discovery-swipe-ignore]',
    '.ant-select', '.ant-picker', '.ant-slider', '.ant-tabs-nav', '.ant-carousel', '.slick-slider',
    '.reserve-chat-panel', '.reserve-messenger-thread', '.reserve-messenger-panel-shell',
    '[class*="reserve-form-cal"]', '[class*="reserve-cal-"]', '.reserve-time-parts', '.reserve-time-wheels',
    '.ant-picker-panel', '.reserve-region-sheet-root',
].join(',');
const PAGE_LOADING = '.reserve-route-skeleton, .reserve-skeleton-block:not(.reserve-skeleton-block--local)';
const swipeViewport = () => window.innerWidth <= 767
    && (!window.visualViewport || Math.abs(window.visualViewport.scale - 1) < 0.01);

function hasOpenOverlay() {
    return [...document.querySelectorAll('[role="dialog"], .ant-drawer-open, .reserve-messenger-panel-shell')]
        .some(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
}

function isProtectedTarget(target, content) {
    const element = target instanceof Element ? target : target?.parentElement;
    if (!element || !content.contains(element) || element.closest(PROTECTED_TARGETS)) return true;
    const link = element.closest('a, [role="link"]');
    if (link && !link.matches(SWIPE_LINKS)) return true;
    // 가로 목록·캐러셀은 첫 항목·마지막 항목에서도 자체 제스처를 사용한다.
    for (let ancestor = element; ancestor && ancestor !== content; ancestor = ancestor.parentElement) {
        if (ancestor.scrollWidth <= ancestor.clientWidth + 2) continue;
        const style = getComputedStyle(ancestor);
        if (/auto|scroll/.test(style.overflowX) || style.scrollSnapType?.startsWith('x')) return true;
    }
    return false;
}

export default function useDiscoverySwipe(contentRef) {
    const location = useLocation();
    const navigate = useNavigate();
    const lockedUntil = useRef(0);
    const suppressClickUntil = useRef(0);

    useEffect(() => {
        const content = contentRef.current;
        if (!content || !isDiscoveryRootPath(location.pathname, location.search)) return undefined;
        const index = DISCOVERY_NAV_ITEMS.findIndex(item => item.to === discoveryPath(location.pathname));
        const adjacent = dx => DISCOVERY_NAV_ITEMS[index + (dx < 0 ? 1 : -1)];
        const unavailable = () => !swipeViewport() || Date.now() < lockedUntil.current
            || [...content.querySelectorAll(PAGE_LOADING)].some(element => element.getClientRects().length)
            || hasOpenOverlay();
        let gesture = null;
        let frame = 0;
        let settleTimer = 0;

        const clearMotion = () => {
            cancelAnimationFrame(frame);
            clearTimeout(settleTimer);
            content.classList.remove(DRAGGING, SETTLING);
            content.style.removeProperty(OFFSET);
        };
        const cancel = () => {
            const wasDragging = gesture?.horizontal;
            gesture = null;
            if (!wasDragging) return;
            cancelAnimationFrame(frame);
            if (!content.classList.replace(DRAGGING, SETTLING)) return;
            content.style.removeProperty(OFFSET);
            settleTimer = window.setTimeout(clearMotion, SETTLE_MS);
        };
        const start = (event, point, input) => {
            cancel();
            if (unavailable() || isProtectedTarget(event.target, content) || window.getSelection()?.toString()) return;
            const x = point.clientX;
            if (x <= EDGE_PX || x >= window.innerWidth - EDGE_PX) return;
            clearMotion();
            gesture = {
                input, id: point.identifier ?? point.pointerId, x, y: point.clientY,
                scrollY: window.scrollY, at: event.timeStamp, horizontal: false,
            };
        };
        const move = (event, point) => {
            const dx = point.clientX - gesture.x;
            const dy = Math.abs(point.clientY - gesture.y);
            const touch = gesture.input === 'touch';
            if (!swipeViewport() || Math.abs(window.scrollY - gesture.scrollY) > 3) { cancel(); return; }
            if (touch && dy >= AXIS_LOCK_PX && Math.abs(dx) <= dy * 1.5) { cancel(); return; }
            if (!gesture.horizontal) {
                if (Math.max(Math.abs(dx), dy) < (touch ? TOUCH_LOCK_PX : AXIS_LOCK_PX)) return;
                if (Math.abs(dx) <= dy * (touch ? 1.75 : 1.25)) { cancel(); return; }
                gesture.horizontal = true;
            }
            // 터치의 세로 관성은 브라우저가 계속 처리하고 마우스 드래그에서만 기본 동작을 막는다.
            if (!touch) {
                if (!event.cancelable) { cancel(); return; }
                event.preventDefault();
            }
            suppressClickUntil.current = Date.now() + 500;

            const hasNeighbor = Boolean(adjacent(dx));
            const limit = window.innerWidth * (hasNeighbor ? 0.24 : 0.08);
            const offset = Math.sign(dx) * Math.min(limit, Math.abs(dx) * (hasNeighbor ? 0.72 : 0.2));
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                content.classList.add(DRAGGING);
                content.style.setProperty(OFFSET, offset + 'px');
            });
        };
        const end = (event, point) => {
            const { horizontal, x, y, at, scrollY } = gesture;
            const dx = point.clientX - x;
            const dy = Math.abs(point.clientY - y);
            const distance = Math.abs(dx);
            const duration = Math.max(1, event.timeStamp - at);
            const threshold = Math.max(56, Math.min(94, window.innerWidth * 0.2));
            const flick = distance >= 28 && duration <= 250 && distance / duration >= 0.45;
            const destination = adjacent(dx);
            if (horizontal) suppressClickUntil.current = Date.now() + 500;
            if (!horizontal || distance <= dy * 1.5 || (distance < threshold && !flick)
                || !destination || unavailable() || Math.abs(window.scrollY - scrollY) > 3) { cancel(); return; }
            gesture = null;
            clearMotion();
            rememberDiscoveryLocation(location, { left: window.scrollX, top: window.scrollY });
            lockedUntil.current = Date.now() + SETTLE_MS;
            navigate(discoveryTabDestination(destination.to), {
                state: { reserveRouteMotion: discoveryTabMotion(location.pathname, destination.to) },
            });
        };

        const listeners = new window.AbortController();
        const passive = { passive: true, signal: listeners.signal };
        const active = { passive: false, signal: listeners.signal };
        const capture = { capture: true, signal: listeners.signal };
        document.addEventListener('touchstart', event => {
            if (event.touches.length !== 1) { cancel(); return; }
            if (!content.contains(event.target)) return;
            suppressClickUntil.current = 0;
            start(event, event.touches[0], 'touch');
        }, { ...passive, capture: true });
        content.addEventListener('touchmove', event => {
            if (gesture?.input !== 'touch') return;
            const touch = event.touches[0];
            if (event.touches.length !== 1 || touch.identifier !== gesture.id) { cancel(); return; }
            move(event, touch);
        }, passive);
        content.addEventListener('touchend', event => {
            if (gesture?.input !== 'touch') return;
            const touch = [...event.changedTouches].find(item => item.identifier === gesture.id);
            if (event.touches.length || !touch) { cancel(); return; }
            end(event, touch);
        }, passive);
        content.addEventListener('touchcancel', cancel, passive);
        content.addEventListener('pointerdown', event => {
            suppressClickUntil.current = 0;
            if (event.pointerType === 'mouse' && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                start(event, event, 'mouse');
            }
        }, capture);
        window.addEventListener('pointermove', event => {
            if (gesture?.input !== 'mouse' || event.pointerId !== gesture.id) return;
            if (!(event.buttons & 1)) { cancel(); return; }
            move(event, event);
        }, active);
        window.addEventListener('pointerup', event => {
            if (gesture?.input === 'mouse' && event.pointerId === gesture.id) end(event, event);
        }, passive);
        // 터치에서 포인터만 취소돼도 touchmove와 touchend는 이어질 수 있다.
        window.addEventListener('pointercancel', event => {
            if (gesture?.input === 'mouse' && event.pointerId === gesture.id) cancel();
        }, passive);
        window.addEventListener('blur', cancel, passive);
        content.addEventListener('dragstart', event => {
            if (gesture?.input === 'mouse') event.preventDefault();
        }, capture);
        content.addEventListener('click', event => {
            if (event.detail === 0 || Date.now() > suppressClickUntil.current) return;
            suppressClickUntil.current = 0;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, capture);
        return () => {
            listeners.abort();
            clearMotion();
        };
    }, [contentRef, location, navigate]);
}
