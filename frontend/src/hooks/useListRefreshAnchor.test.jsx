import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useListRefreshAnchor from './useListRefreshAnchor';

const INITIAL_ROWS = [
    { id: 'above-clip', offset: 100 },
    { id: 'reading', offset: 220 },
    { id: 'next', offset: 300 },
    { id: 'last', offset: 380 },
];
const rect = (top, height) => ({ top, bottom: top + height, left: 0, right: 400, width: 400, height, x: 0, y: top });
const fixtures = new Set();
let observers;
let frames;
let frameId;

// jsdom has no layout: model content offsets against a real scrollTop, rather than
// asserting calls to the hook's internal snapshot or correction functions.
function createList() {
    const port = document.createElement('div');
    const list = document.createElement('section');
    port.style.overflowY = 'auto';
    Object.defineProperties(port, {
        clientTop: { value: 2 },
        clientHeight: { value: 200 },
        scrollHeight: { value: 2_000 },
    });
    port.getBoundingClientRect = () => rect(100, 204);
    port.scrollTop = 200;
    port.append(list);
    document.body.append(port);
    fixtures.add(port);
    const rows = new Map();
    const setRows = data => {
        rows.clear();
        list.replaceChildren(...data.map(item => {
            const row = document.createElement('article');
            row.dataset.listItemId = item.id;
            row.getBoundingClientRect = () => rect(102 + item.offset - port.scrollTop, 80);
            rows.set(item.id, row);
            return row;
        }));
    };
    setRows(INITIAL_ROWS);
    return { port, list, setRows, top: id => rows.get(id).getBoundingClientRect().top };
}

function mountList() {
    const fixture = createList();
    const ref = { current: fixture.list };
    const hook = renderHook(({ refreshing, data, listKey }) => useListRefreshAnchor(ref, listKey, refreshing, data), {
        initialProps: { refreshing: false, data: INITIAL_ROWS, listKey: 'feed:all' },
    });
    return {
        ...fixture,
        ...hook,
        start: () => hook.rerender({ refreshing: true, data: INITIAL_ROWS, listKey: 'feed:all' }),
        finish: data => {
            fixture.setRows(data);
            hook.rerender({ refreshing: false, data, listKey: 'feed:all' });
        },
    };
}

const shiftedRows = delta => INITIAL_ROWS.map(row => row.id === 'above-clip' ? row : { ...row, offset: row.offset + delta });
const notifySize = list => act(() => {
    for (const observer of observers) {
        if (observer.targets.has(list)) observer.callback([{ target: list }], observer);
    }
});

describe('list refresh reading position', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        observers = [];
        frames = new Map();
        frameId = 0;
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback) {
                this.callback = callback;
                this.targets = new Set();
                this.disconnect = vi.fn(() => this.targets.clear());
                observers.push(this);
            }
            observe(target) { this.targets.add(target); }
        });
        vi.stubGlobal('requestAnimationFrame', vi.fn(callback => {
            const id = ++frameId;
            frames.set(id, callback);
            return id;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn(id => frames.delete(id)));
        vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    });
    afterEach(() => {
        cleanup();
        fixtures.forEach(port => port.remove());
        fixtures.clear();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('keeps the visible row inside its nested scroller when earlier content grows', () => {
        const view = mountList();
        const readingTop = view.top('reading');
        // This row intersects the window but is clipped by the nested viewport.
        expect(view.top('above-clip') + 80).toBeLessThan(102);
        view.start();

        view.finish(shiftedRows(80));

        expect(view.top('reading')).toBe(readingTop);
        expect(view.port.scrollTop).toBe(280);
        expect(window.scrollBy).not.toHaveBeenCalled();
    });

    it('keeps the next surviving visible row when the first visible row is deleted', () => {
        const view = mountList();
        const nextTop = view.top('next');
        view.start();

        view.finish(INITIAL_ROWS.filter(row => row.id !== 'reading').map(row => (
            row.id === 'above-clip' ? row : { ...row, offset: row.offset - 80 }
        )));

        expect(view.list.querySelector('[data-list-item-id="reading"]')).toBeNull();
        expect(view.top('next')).toBe(nextTop);
        expect(view.port.scrollTop).toBe(120);
        expect(window.scrollBy).not.toHaveBeenCalled();
    });

    it.each([
        ['wheel', () => new Event('wheel', { bubbles: true })],
        ['touch', () => new Event('touchstart', { bubbles: true })],
        ['scroll key', () => new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })],
        ['keyboard focus navigation', () => new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })],
    ])('does not undo the user\'s %s movement during a refresh', (_, event) => {
        const view = mountList();
        view.start();
        act(() => {
            view.port.scrollTop = 230;
            view.port.dispatchEvent(event());
        });

        view.finish(shiftedRows(80));

        expect(view.port.scrollTop).toBe(230);
        expect(observers).toHaveLength(0);
        expect(frames.size).toBe(0);
        expect(window.scrollBy).not.toHaveBeenCalled();
    });

    it('keeps the row stable while late images resize, then releases the short observation window', () => {
        const view = mountList();
        const readingTop = view.top('reading');
        view.start();
        view.finish(shiftedRows(40));
        expect(view.top('reading')).toBe(readingTop);
        expect(observers).toHaveLength(1);
        expect(observers[0].targets.has(view.list)).toBe(true);

        // The data read is complete; an image above the anchor finishes later.
        view.setRows(shiftedRows(90));
        notifySize(view.list);
        expect(view.top('reading')).toBe(readingTop);
        expect(view.port.scrollTop).toBe(290);

        act(() => vi.advanceTimersByTime(3_000));
        expect(observers[0].disconnect).toHaveBeenCalledOnce();
        expect(frames.size).toBe(0);
        view.setRows(shiftedRows(120));
        notifySize(view.list);
        expect(view.port.scrollTop).toBe(290);
    });

    it('cancels late image corrections once the user scrolls after the read completes', () => {
        const view = mountList();
        view.start();
        view.finish(shiftedRows(40));
        act(() => {
            view.port.scrollTop = 270;
            view.port.dispatchEvent(new Event('wheel', { bubbles: true }));
        });

        view.setRows(shiftedRows(100));
        notifySize(view.list);

        expect(view.port.scrollTop).toBe(270);
        expect(observers[0].disconnect).toHaveBeenCalledOnce();
        expect(frames.size).toBe(0);
    });
});
