import { useCallback, useLayoutEffect, useRef } from 'react';
import useAuthStore from '../../store/useAuthStore';

const HOLD_MS = 500;
const MOVE_PX = 10;
const MENU_BUTTON = '.reserve-chat-message-meta > button.reserve-chat-message-actions';
const openMenu = (list, button) => {
    if (!button || button.disabled || button.getAttribute('aria-expanded') === 'true') return;
    list.querySelector(MENU_BUTTON + '[aria-expanded="true"]')?.click();
    button.click();
};

const isNearStart = (touch, hold) => touch?.identifier === hold.id
    && Math.hypot(touch.clientX - hold.x, touch.clientY - hold.y) <= MOVE_PX;

export default function useChatMessageHold(roomId) {
    const press = useRef(null);
    const suppressedClick = useRef(null);
    const pointerType = useRef('');
    const cancel = useCallback(() => {
        press.current?.listeners.abort();
        press.current = null;
    }, []);
    useLayoutEffect(() => {
        suppressedClick.current = null;
        return cancel;
    }, [roomId, cancel]);

    const start = event => {
        cancel();
        suppressedClick.current = null;
        if (event.touches.length !== 1) return;
        const surface = event.target.closest?.('.reserve-chat-message-bubble, .reserve-chat-image-message');
        const row = surface?.closest('.reserve-chat-message-row');
        const button = row?.querySelector(MENU_BUTTON);
        if (!button || button.disabled || !event.currentTarget.contains(row)) return;

        const touch = event.touches[0];
        const scrollport = row.closest('.reserve-messenger-thread-body');
        const listeners = new window.AbortController();
        const options = { capture: true, passive: true, signal: listeners.signal };
        press.current = {
            id: touch.identifier, x: touch.clientX, y: touch.clientY, at: event.timeStamp,
            surface, button, listeners, scrollport, scrollTop: scrollport?.scrollTop,
            revision: useAuthStore.getState().sessionRevision,
        };
        window.addEventListener('scroll', cancel, options);
        window.addEventListener('blur', cancel, options);
        document.addEventListener('visibilitychange', cancel, options);
        document.addEventListener('touchstart', next => {
            if (next.touches.length > 1) cancel();
        }, options);
    };

    const move = event => {
        const hold = press.current;
        if (hold && (event.touches.length !== 1 || !isNearStart(event.touches[0], hold))) cancel();
    };

    const release = event => {
        const hold = press.current;
        cancel();
        if (!hold || event.touches.length || !isNearStart(event.changedTouches[0], hold)
            || event.timeStamp - hold.at < HOLD_MS || hold.scrollport?.scrollTop !== hold.scrollTop
            || !event.currentTarget.contains(hold.button) || hold.button.disabled
            || hold.revision !== useAuthStore.getState().sessionRevision) return;

        // 놓는 순간까지 가만히 있었을 때만 메뉴를 열고 사진 확대 클릭을 막는다.
        event.preventDefault();
        suppressedClick.current = hold.surface;
        openMenu(event.currentTarget, hold.button);
    };

    return {
        onTouchStart: start,
        onTouchMove: move,
        onTouchEnd: release,
        onTouchCancel: cancel,
        onContextMenu: event => {
            if (press.current?.surface.contains(event.target) || suppressedClick.current?.contains(event.target)) event.preventDefault();
        },
        onPointerDownCapture: event => { suppressedClick.current = null; pointerType.current = event.pointerType; },
        onClickCapture: event => {
            if (event.detail === 0 || !suppressedClick.current?.contains(event.target)) return;
            suppressedClick.current = null;
            event.preventDefault();
            event.stopPropagation();
        },
        onClick: event => {
            const pointer = event.nativeEvent.pointerType || pointerType.current;
            if (event.detail !== 1 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
                || (pointer ? pointer !== 'mouse' : !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches)) return;
            const bubble = event.target.closest?.('.reserve-chat-message-bubble');
            if (!bubble) return;
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && selection.containsNode(bubble, true)) return;
            openMenu(event.currentTarget, bubble.closest('.reserve-chat-message-row')?.querySelector(MENU_BUTTON));
        },
    };
}
