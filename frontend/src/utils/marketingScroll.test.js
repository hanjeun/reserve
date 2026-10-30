import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMarketingScroll } from '../../../marketing/src/scroll.js';

let cleanup;
let motion;
let position;
let heights;
let callbacks;
let nextFrame;
const main = () => document.querySelector('main');
const wheel = (target = main(), options = {}) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, ...options });
    target.dispatchEvent(event);
    return event;
};
const frame = time => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach(callback => callback(time));
};
const swipe = (type, point) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, type === 'touchstart' ? 'touches' : 'changedTouches', { value: [point] });
    main().dispatchEvent(event);
};

beforeEach(() => {
    vi.useFakeTimers();
    position = 0;
    heights = [700, 700, 700];
    callbacks = new Map();
    nextFrame = 0;
    document.body.innerHTML = '<header class="marketing-header"><a href="/" data-scroll-top>RESERVE</a></header><main>'
        + heights.map((_, index) => `<section class="marketing-scene" data-index="${index}"><textarea></textarea></section>`).join('') + '</main><footer></footer>';
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 64 + heights.reduce((sum, height) => sum + height, 0) + 300 });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(764);
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => position);
    vi.spyOn(window, 'scrollTo').mockImplementation((_, y) => { position = y; });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++nextFrame, callback); return nextFrame; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id));
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.tagName === 'HEADER') return { top: 0, height: 64 };
        const index = this.tagName === 'FOOTER' ? heights.length : Number(this.dataset.index ?? 0);
        return { top: 64 + heights.slice(0, index).reduce((sum, height) => sum + height, 0) - position, height: heights[index] ?? 300 };
    });
    motion = new EventTarget();
    motion.matches = false;
    cleanup = installMarketingScroll(document, motion);
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    delete document.documentElement.scrollHeight;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it('settles one scene per wheel gesture and absorbs its remaining momentum', () => {
    expect(wheel().defaultPrevented).toBe(true);
    frame(0); frame(140);
    expect(position).toBeGreaterThan(350);
    expect(position).toBeLessThan(700);
    wheel(); frame(280);
    expect(position).toBeLessThan(700);
    frame(420);
    expect(position).toBe(700);
    expect(wheel().defaultPrevented).toBe(true);
    expect(callbacks.size).toBe(0);
    vi.advanceTimersByTime(160);
    wheel(); frame(450); frame(870);
    expect(position).toBe(1400);
});

it('allows tall scene content to scroll naturally before leaving its lower boundary', () => {
    heights[1] = 1400;
    position = 700;
    expect(wheel().defaultPrevented).toBe(false);
    expect(callbacks.size).toBe(0);
    position = 1400;
    expect(wheel().defaultPrevented).toBe(true);
    frame(0); frame(420);
    expect(position).toBe(2100);
});

it('leaves text input, nested scrolling, horizontal scrolling and pinch zoom native', () => {
    expect(wheel(document.querySelector('textarea')).defaultPrevented).toBe(false);
    expect(wheel(main(), { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(wheel(main(), { deltaX: 200 }).defaultPrevented).toBe(false);
    const nested = document.createElement('div');
    nested.style.overflowY = 'auto';
    Object.defineProperties(nested, { scrollHeight: { value: 500 }, clientHeight: { value: 100 } });
    main().append(nested);
    expect(wheel(nested).defaultPrevented).toBe(false);
    expect(callbacks.size).toBe(0);
});

it('scrolls the logo to the top with intermediate frames instead of reloading the document', () => {
    position = 1400;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('[data-scroll-top]').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    frame(0); frame(210);
    expect(position).toBeGreaterThan(0);
    expect(position).toBeLessThan(700);
    frame(420);
    expect(position).toBe(0);
    expect(document.documentElement).not.toHaveClass('marketing-scrolling');
});

it('keeps scrolling native and returns to the top immediately under reduced motion', () => {
    motion.matches = true;
    expect(wheel().defaultPrevented).toBe(false);
    position = 1400;
    document.querySelector('[data-scroll-top]').click();
    expect(position).toBe(0);
    expect(callbacks.size).toBe(0);
});

it('cancels an unfinished transition on keyboard input, viewport changes and page suspension', () => {
    for (const event of [new KeyboardEvent('keydown', { key: 'PageDown' }), new Event('resize'), new Event('pagehide')]) {
        wheel(); frame(0);
        (event.type === 'keydown' ? document : window).dispatchEvent(event);
        expect(callbacks.size).toBe(0);
        expect(document.documentElement).not.toHaveClass('marketing-scrolling');
    }
});

it('settles a vertical swipe to the next scene without treating a horizontal gesture as navigation', () => {
    swipe('touchstart', { clientX: 50, clientY: 500 });
    position = 300;
    swipe('touchend', { clientX: 55, clientY: 100 });
    frame(0); frame(420);
    expect(position).toBe(700);
    swipe('touchstart', { clientX: 50, clientY: 500 });
    swipe('touchend', { clientX: 300, clientY: 480 });
    expect(callbacks.size).toBe(0);
});
