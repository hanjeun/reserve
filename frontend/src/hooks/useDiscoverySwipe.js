import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DISCOVERY_NAV_ITEMS, isDiscoveryRootPath } from '../constants/discovery';
import { discoveryPath, discoveryTabDestination, discoveryTabMotion, rememberDiscoveryLocation } from '../utils/discoveryNavigation';

const EDGE_PX = 24;
const PROTECTED_TARGETS = [
    'a', 'button', 'input', 'textarea', 'select', 'label', '[contenteditable]:not([contenteditable="false"])',
    '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="combobox"]', '[role="slider"]',
    '[role="dialog"]', '[role="grid"]', '[role="gridcell"]', '[data-discovery-swipe-ignore]',
    '.ant-select', '.ant-picker', '.ant-slider', '.ant-tabs-nav', '.ant-carousel', '.slick-slider',
    '.reserve-chat-panel', '.reserve-messenger-thread', '.reserve-messenger-panel-shell',
    '[class*="reserve-form-cal"]', '[class*="reserve-cal-"]', '.reserve-time-parts', '.reserve-time-wheels',
    '.ant-picker-panel', '.reserve-region-sheet-root',
].join(',');
const PAGE_LOADING = '.reserve-route-skeleton, .reserve-skeleton-block:not(.reserve-skeleton-block--local)';
const mobileTouchPage = () => window.innerWidth <= 767
    && (!window.visualViewport || Math.abs(window.visualViewport.scale - 1) < 0.01);

function hasOpenOverlay() {
    return [...document.querySelectorAll('[role="dialog"], .ant-drawer-open, .reserve-messenger-panel-shell')]
        .some(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
}

function isProtectedTarget(target, content) {
    const element = target instanceof Element ? target : target?.parentElement;
    if (!element || element.closest(PROTECTED_TARGETS)) return true;
    // 가로 목록·캐러셀은 첫 항목·마지막 항목에서도 제스처를 유지한다.
    for (let ancestor = element; ancestor && ancestor !== content; ancestor = ancestor.parentElement) {
        if (ancestor.scrollWidth <= ancestor.clientWidth + 2) continue;
        const style = getComputedStyle(ancestor);
        if (/auto|scroll/.test(style.overflowX) || style.scrollSnapType.startsWith('x')) return true;
    }
    return false;
}

/* 큰 가로 터치 한 번으로 한 탐색 탭만 이동하고 스크롤·가장자리 뒤로가기를 보존한다. */
export default function useDiscoverySwipe(contentRef) {
    const location = useLocation();
    const navigate = useNavigate();
    const lockedUntil = useRef(0);

    useEffect(() => {
        const content = contentRef.current;
        if (!content || !isDiscoveryRootPath(location.pathname, location.search)) return undefined;
        let gesture = null;
        const unavailable = () => !mobileTouchPage() || Date.now() < lockedUntil.current
            || [...content.querySelectorAll(PAGE_LOADING)].some(element => element.getClientRects().length)
            || hasOpenOverlay();
        const cancel = () => { gesture = null; };
        const start = event => {
            cancel();
            if (event.touches.length !== 1 || unavailable() || isProtectedTarget(event.target, content)) return;
            const touch = event.touches[0];
            if (touch.clientX <= EDGE_PX || touch.clientX >= window.innerWidth - EDGE_PX) return;
            if (window.getSelection()?.toString()) return;
            gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, scrollY: window.scrollY, at: Date.now() };
        };
        const move = event => {
            if (!gesture) return;
            if (event.touches.length !== 1 || !mobileTouchPage()) { cancel(); return; }
            const touch = event.touches[0];
            const dx = Math.abs(touch.clientX - gesture.x);
            const dy = Math.abs(touch.clientY - gesture.y);
            if (touch.identifier !== gesture.id || dy > 32 || (dy > 12 && dy >= dx * 0.6)) cancel();
        };
        const end = event => {
            const started = gesture;
            cancel();
            if (!started || event.touches.length || unavailable()) return;
            const touch = [...event.changedTouches].find(item => item.identifier === started.id);
            if (!touch || Date.now() - started.at > 1500 || Math.abs(window.scrollY - started.scrollY) > 8) return;
            const dx = touch.clientX - started.x;
            const dy = Math.abs(touch.clientY - started.y);
            const threshold = Math.max(96, Math.min(window.innerWidth * 0.28, 160));
            if (Math.abs(dx) < threshold || dy > 32 || Math.abs(dx) < dy * 2) return;
            const index = DISCOVERY_NAV_ITEMS.findIndex(item => item.to === discoveryPath(location.pathname));
            const destination = DISCOVERY_NAV_ITEMS[index + (dx < 0 ? 1 : -1)];
            if (!destination) return;
            rememberDiscoveryLocation(location, { left: window.scrollX, top: window.scrollY });
            lockedUntil.current = Date.now() + 500;
            navigate(discoveryTabDestination(destination.to), {
                state: { reserveRouteMotion: discoveryTabMotion(location.pathname, destination.to) },
            });
        };
        const options = { passive: true };
        content.addEventListener('touchstart', start, options);
        content.addEventListener('touchmove', move, options);
        content.addEventListener('touchend', end, options);
        content.addEventListener('touchcancel', cancel, options);
        return () => {
            content.removeEventListener('touchstart', start);
            content.removeEventListener('touchmove', move);
            content.removeEventListener('touchend', end);
            content.removeEventListener('touchcancel', cancel);
        };
    }, [contentRef, location, navigate]);
}
