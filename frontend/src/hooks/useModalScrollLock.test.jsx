import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useModalScrollLock from './useModalScrollLock';

const addDialog = (className = '') => {
    const element = document.createElement('div');
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.className = className;
    element.getClientRects = () => element.style.display === 'none' ? [] : [{}];
    document.body.append(element);
    return element;
};
const flush = () => act(async () => { await Promise.resolve(); });
const dispatchTouch = (element, type, points) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
    element.dispatchEvent(event);
    return event;
};
const move = (element, dx, dy) => {
    dispatchTouch(element, 'touchstart', [[120, 180]]);
    return dispatchTouch(element, 'touchmove', [[120 + dx, 180 + dy]]);
};
const scrollable = parent => {
    const element = document.createElement('div');
    element.style.overflowX = 'auto';
    element.style.overflowY = 'auto';
    Object.defineProperties(element, {
        clientHeight: { value: 220 }, scrollHeight: { value: 600 },
        clientWidth: { value: 220 }, scrollWidth: { value: 600 },
    });
    parent.append(element);
    return element;
};

describe('useModalScrollLock', () => {
    let originalStyles;
    let originalUrl;
    beforeEach(() => {
        originalStyles = document.body.getAttribute('style');
        originalUrl = window.location.href;
        vi.spyOn(window, 'scrollX', 'get').mockReturnValue(0);
        vi.spyOn(window, 'scrollY', 'get').mockReturnValue(640);
        vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    });
    afterEach(() => {
        cleanup();
        document.querySelectorAll('[role="dialog"], .ant-select-dropdown').forEach(element => element.remove());
        if (originalStyles === null) document.body.removeAttribute('style');
        else document.body.setAttribute('style', originalStyles);
        window.history.replaceState(null, '', originalUrl);
        vi.restoreAllMocks();
    });

    it('locks an already open dialog and restores position and owned styles after the last one closes', async () => {
        document.body.style.position = 'relative';
        document.body.style.top = '13px';
        const dialog = addDialog();
        const { unmount } = renderHook(() => useModalScrollLock());
        expect(document.body.style.position).toBe('fixed');
        expect(document.body.style.top).toBe('-640px');
        document.body.style.overflow = 'auto';
        dialog.remove();
        await flush();
        expect(document.body.style.position).toBe('relative');
        expect(document.body.style.top).toBe('13px');
        expect(document.body.style.overflow).toBe('auto');
        expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 640, behavior: 'instant' });
        unmount();
    });

    it('observes newly opened and hidden dialogs and keeps the lock through nested dialogs', async () => {
        const { unmount } = renderHook(() => useModalScrollLock());
        const first = addDialog();
        await flush();
        const second = addDialog();
        await flush();
        second.remove();
        await flush();
        expect(document.body.style.position).toBe('fixed');
        expect(window.scrollTo).not.toHaveBeenCalled();
        first.style.display = 'none';
        await flush();
        expect(document.documentElement).not.toHaveAttribute('data-reserve-modal-open');
        expect(window.scrollTo).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('blocks touch scroll on the background and non-scrollable calendar surface', () => {
        const background = document.createElement('div');
        document.body.append(background);
        const dialog = addDialog();
        const { unmount } = renderHook(() => useModalScrollLock());
        expect(move(background, 0, -70).defaultPrevented).toBe(true);
        expect(move(dialog, 0, 70).defaultPrevented).toBe(true);
        unmount();
        expect(move(background, 0, -70).defaultPrevented).toBe(false);
        background.remove();
    });

    it('allows internal wheel/form scrolling and contains touch movement at both boundaries', () => {
        const content = scrollable(addDialog());
        const { unmount } = renderHook(() => useModalScrollLock());
        content.scrollTop = 100;
        expect(move(content, 0, 70).defaultPrevented).toBe(false);
        expect(move(content, 0, -70).defaultPrevented).toBe(false);
        content.scrollTop = 0;
        expect(move(content, 0, 70).defaultPrevented).toBe(true);
        content.scrollTop = 380;
        expect(move(content, 0, -70).defaultPrevented).toBe(true);
        content.scrollLeft = 100;
        expect(move(content, -70, 0).defaultPrevented).toBe(false);
        unmount();
    });

    it('allows scrolling a select popup portaled outside the dialog', () => {
        addDialog();
        const popup = document.createElement('div');
        popup.className = 'ant-select-dropdown';
        document.body.append(popup);
        const content = scrollable(popup);
        const { unmount } = renderHook(() => useModalScrollLock());
        content.scrollTop = 100;
        expect(move(content, 0, -70).defaultPrevented).toBe(false);
        content.scrollTop = 380;
        expect(move(content, 0, -70).defaultPrevented).toBe(true);
        unmount();
    });

    it('preserves pinch gestures and image-preview panning', () => {
        const dialog = addDialog('ant-image-preview');
        const { unmount } = renderHook(() => useModalScrollLock());
        expect(move(dialog, 70, 0).defaultPrevented).toBe(false);
        dispatchTouch(dialog, 'touchstart', [[100, 100], [200, 100]]);
        expect(dispatchTouch(dialog, 'touchmove', [[80, 100], [220, 100]]).defaultPrevented).toBe(false);
        unmount();
    });

    it('does not restore a previous page scroll after navigation', async () => {
        const dialog = addDialog();
        const { unmount } = renderHook(() => useModalScrollLock());
        window.history.replaceState(null, '', '/another-page');
        dialog.remove();
        await flush();
        expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0, behavior: 'instant' });
        unmount();
    });
});
