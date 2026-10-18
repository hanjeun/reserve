import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isDiscoveryRootPath } from '../constants/discovery';
import { discoveryScrollPosition, rememberDiscoveryLocation } from '../utils/discoveryNavigation';

const PAGE_LOADING = '.reserve-route-skeleton, .reserve-skeleton-block:not(.reserve-skeleton-block--local)';
const RESTORE_WAIT_MS = 8000;
const isMessagesPath = pathname => /^\/messages\/?$/.test(pathname);
const currentPosition = () => ({ left: window.scrollX, top: window.scrollY });
const scrollInstantly = position => window.scrollTo({ ...position, behavior: 'instant' });

/** Discovery tabs and the exact history entry beneath messages keep their last position. */
function ScrollToTop() {
    const location = useLocation();
    const current = useRef(null);
    const position = useRef(currentPosition());
    const restoring = useRef(false);
    const messengerReturn = useRef(null);

    useEffect(() => {
        const previousRestoration = window.history.scrollRestoration;
        window.history.scrollRestoration = 'manual';
        const onScroll = () => {
            if (restoring.current) return;
            position.current = currentPosition();
        };
        const onPageHide = () => {
            if (current.current && !restoring.current) rememberDiscoveryLocation(current.current, position.current);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('pagehide', onPageHide);
        return () => {
            onPageHide();
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('pagehide', onPageHide);
            window.history.scrollRestoration = previousRestoration;
        };
    }, []);

    useLayoutEffect(() => {
        const previous = current.current;
        if (previous && !restoring.current) rememberDiscoveryLocation(previous, position.current);
        current.current = location;
        let saved = discoveryScrollPosition(location);
        let returningFromMessages = false;
        if (isMessagesPath(location.pathname)) {
            if (previous && !isMessagesPath(previous.pathname)) {
                messengerReturn.current = { key: previous.key, position: { ...position.current } };
            }
        } else if (previous && isMessagesPath(previous.pathname)) {
            if (messengerReturn.current?.key === location.key) {
                saved = messengerReturn.current.position;
                returningFromMessages = true;
            }
            messengerReturn.current = null;
        }
        rememberDiscoveryLocation(location);

        // Existing filter/query updates own their scroll behavior and do not count as entering another page.
        if (previous?.pathname === location.pathname) {
            position.current = currentPosition();
            restoring.current = false;
            return undefined;
        }
        if ((!returningFromMessages && !isDiscoveryRootPath(location.pathname, location.search)) || !saved || saved.top === 0) {
            position.current = { left: 0, top: 0 };
            restoring.current = false;
            scrollInstantly(position.current);
            return undefined;
        }

        restoring.current = true;
        position.current = saved;
        const deadline = Date.now() + RESTORE_WAIT_MS;
        let finished = false;
        let frame = 0;
        let pollTimer = 0;
        let readyFrames = 0;
        let mutationObserver;
        let resizeObserver;
        const content = document.querySelector('.ant-layout-content');
        const isLoading = () => [...(content ?? document).querySelectorAll(PAGE_LOADING)]
            .some(element => element.getClientRects().length);
        const stop = () => {
            finished = true;
            cancelAnimationFrame(frame);
            window.clearTimeout(pollTimer);
            mutationObserver?.disconnect();
            resizeObserver?.disconnect();
            window.removeEventListener('wheel', interrupt);
            window.removeEventListener('touchstart', interrupt);
            window.removeEventListener('keydown', onKeyDown);
            restoring.current = false;
        };
        const finish = () => {
            scrollInstantly(saved);
            position.current = currentPosition();
            rememberDiscoveryLocation(location, position.current);
            stop();
        };
        const interrupt = () => {
            stop();
            position.current = currentPosition();
        };
        const onKeyDown = event => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) interrupt();
        };
        const check = () => {
            if (finished) return;
            const loading = isLoading();
            readyFrames = loading ? 0 : readyFrames + 1;
            const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
            if (readyFrames >= 2 && height - window.innerHeight >= saved.top - 1) { finish(); return; }
            if (Date.now() >= deadline) {
                // A still-loading short skeleton must not clamp and overwrite the saved destination.
                if (!loading) finish();
                else stop();
                return;
            }
            if (!loading && readyFrames < 2) frame = requestAnimationFrame(check);
            else pollTimer = window.setTimeout(schedule, 100);
        };
        const schedule = () => {
            if (finished) return;
            cancelAnimationFrame(frame);
            window.clearTimeout(pollTimer);
            frame = requestAnimationFrame(check);
        };
        if (typeof MutationObserver !== 'undefined') {
            mutationObserver = new MutationObserver(schedule);
            mutationObserver.observe(content ?? document.body, { childList: true, subtree: true, attributes: true,
                attributeFilter: ['class', 'aria-busy', 'data-skeleton-shown'] });
        }
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(schedule);
            resizeObserver.observe(content ?? document.body);
        }
        window.addEventListener('wheel', interrupt, { passive: true });
        window.addEventListener('touchstart', interrupt, { passive: true });
        window.addEventListener('keydown', onKeyDown);
        frame = requestAnimationFrame(check);
        return stop;
    }, [location]);

    return null;
}

export default ScrollToTop;
