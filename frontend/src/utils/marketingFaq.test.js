import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installFaqMotion } from '../../../marketing/src/faq.js';

let cleanup;
let motion;
let animate;
const summaries = () => [...document.querySelectorAll('summary')];
const finish = animation => animation.onfinish?.();

beforeEach(() => {
    document.body.innerHTML = [0, 1].map(group => `<div class="faq-collapse">${[0, 1].map(index =>
        `<details name="faq-${group}"><summary>질문 ${index}</summary><div>답변</div></details>`).join('')}</div>`).join('');
    motion = new EventTarget();
    motion.matches = false;
    animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return { height: this.tagName === 'DETAILS' && this.open ? 140 : 60 };
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    cleanup = installFaqMotion(document, motion);
});
afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    delete HTMLElement.prototype.animate;
    vi.restoreAllMocks();
});

it('animates expansion and leaves closing content visible until its animation finishes', () => {
    const summary = summaries()[0];
    const item = summary.parentElement;
    summary.click();
    expect(item.open).toBe(true);
    expect(animate.mock.calls[0][0]).toEqual([{ height: '60px' }, { height: '140px' }]);
    finish(animate.mock.results[0].value);
    summary.click();
    expect(item.open).toBe(true);
    expect(item.dataset.expanded).toBe('false');
    finish(animate.mock.results[1].value);
    expect(item.open).toBe(false);
    expect(item).not.toHaveClass('is-animating');
});

it('cancels rapid toggles without letting an old completion overwrite the latest choice', () => {
    const summary = summaries()[0];
    summary.click();
    const first = animate.mock.results[0].value;
    summary.click();
    expect(first.cancel).toHaveBeenCalledOnce();
    finish(first);
    expect(summary.parentElement.open).toBe(true);
    finish(animate.mock.results[1].value);
    expect(summary.parentElement.open).toBe(false);
});

it('keeps one expanded item per layout and does not close a separate layout', () => {
    const [first, second, mobile] = summaries();
    first.click();
    finish(animate.mock.results.at(-1).value);
    mobile.click();
    finish(animate.mock.results.at(-1).value);
    second.click();
    finish(animate.mock.results.at(-2).value);
    finish(animate.mock.results.at(-1).value);
    expect(first.parentElement.open).toBe(false);
    expect(second.parentElement.open).toBe(true);
    expect(mobile.parentElement.open).toBe(true);
});

it('settles an in-progress animation when reduced motion or the viewport changes', () => {
    const summary = summaries()[0];
    summary.click();
    motion.matches = true;
    motion.dispatchEvent(new Event('change'));
    expect(summary.parentElement).not.toHaveClass('is-animating');
    summary.click();
    expect(summary.parentElement.open).toBe(false);
    expect(animate).toHaveBeenCalledOnce();
    motion.matches = false;
    summary.click();
    window.dispatchEvent(new Event('resize'));
    expect(summary.parentElement.open).toBe(true);
    expect(summary.parentElement).not.toHaveClass('is-animating');
});

it('keeps the native accordion when the animation API is unavailable', () => {
    cleanup();
    delete HTMLElement.prototype.animate;
    cleanup = installFaqMotion(document, motion);
    expect(summaries()[0].parentElement).toHaveAttribute('name', 'faq-0');
    expect(summaries()[0].parentElement).not.toHaveAttribute('data-expanded');
});

it('tracks native expansion, such as a browser search revealing an answer', () => {
    const item = summaries()[0].parentElement;
    item.open = true;
    item.dispatchEvent(new Event('toggle'));
    expect(item.dataset.expanded).toBe('true');
    item.open = false;
    item.dispatchEvent(new Event('toggle'));
    expect(item.dataset.expanded).toBe('false');
});
