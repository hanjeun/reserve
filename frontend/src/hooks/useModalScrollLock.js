import { useEffect } from 'react';

const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], .ant-image-preview';
const POPUP_SELECTOR = '.ant-select-dropdown, .ant-picker-dropdown, .ant-dropdown, .ant-cascader-dropdown';
const BODY_PROPERTIES = ['position', 'top', 'left', 'right'];
const pageIdentity = () => window.location.pathname + window.location.search;
const isVisible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';

const canScroll = (target, boundary, deltaX, deltaY) => {
    const vertical = Math.abs(deltaY) >= Math.abs(deltaX);
    for (let element = target; element && boundary.contains(element); element = element.parentElement) {
        const style = getComputedStyle(element);
        const overflow = vertical ? style.overflowY : style.overflowX;
        const position = vertical ? element.scrollTop : element.scrollLeft;
        const maximum = vertical ? element.scrollHeight - element.clientHeight : element.scrollWidth - element.clientWidth;
        const delta = vertical ? deltaY : deltaX;
        if (/auto|scroll/.test(overflow) && maximum > 1
            && (delta < 0 ? position < maximum - 1 : position > 1)) return true;
        if (element === boundary) break;
    }
    return false;
};

/** Install once: keep the underlying page fixed through every visible modal, including nested dialogs. */
export default function useModalScrollLock() {
    useEffect(() => {
        const body = document.body;
        const html = document.documentElement;
        let saved = null;
        let touch = null;
        let dialogs = [];

        const release = () => {
            if (!saved) return;
            for (const [property, value, priority] of saved.styles) {
                if (value) body.style.setProperty(property, value, priority);
                else body.style.removeProperty(property);
            }
            html.removeAttribute('data-reserve-modal-open');
            const position = saved.page === pageIdentity() ? saved : { x: 0, y: 0 };
            window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
            saved = null;
            touch = null;
        };

        const sync = () => {
            dialogs = [...document.querySelectorAll(MODAL_SELECTOR)].filter(isVisible);
            if (!dialogs.length) { release(); return; }
            if (saved) return;
            saved = {
                x: window.scrollX, y: window.scrollY, page: pageIdentity(),
                styles: BODY_PROPERTIES.map(property => [property, body.style.getPropertyValue(property), body.style.getPropertyPriority(property)]),
            };
            // AntD retains ownership of overflow and scrollbar compensation.
            body.style.position = 'fixed';
            body.style.top = `${-saved.y}px`;
            body.style.left = `${-saved.x}px`;
            body.style.right = '0';
            html.setAttribute('data-reserve-modal-open', 'true');
        };

        const onTouchStart = event => {
            const point = event.touches[0];
            touch = point && event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null;
        };
        const onTouchMove = event => {
            if (!saved || !touch || event.touches.length !== 1 || !event.cancelable || event.defaultPrevented) return;
            const point = event.touches[0];
            const deltaX = point.clientX - touch.x;
            const deltaY = point.clientY - touch.y;
            touch = { x: point.clientX, y: point.clientY };
            if (!deltaX && !deltaY) return;
            const target = event.target instanceof Element ? event.target : event.target?.parentElement;
            if (!target) { event.preventDefault(); return; }
            const dialog = dialogs.find(element => element.contains(target));
            // Image zoom/pan remains owned by AntD. The fixed page still protects its background.
            if (dialog && (dialog.matches('.ant-image-preview') || target.closest('input[type="range"]'))) return;
            const popup = target.closest(POPUP_SELECTOR);
            const boundary = dialog?.closest('.ant-modal-wrap') ?? dialog ?? popup;
            if (!boundary || !canScroll(target, boundary, deltaX, deltaY)) event.preventDefault();
        };

        const observer = new MutationObserver(sync);
        observer.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-modal'] });
        const passive = { capture: true, passive: true };
        const active = { capture: true, passive: false };
        document.addEventListener('touchstart', onTouchStart, passive);
        document.addEventListener('touchmove', onTouchMove, active);
        sync();
        return () => {
            observer.disconnect();
            document.removeEventListener('touchstart', onTouchStart, passive);
            document.removeEventListener('touchmove', onTouchMove, active);
            release();
        };
    }, []);
}
