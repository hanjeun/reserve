import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Hangul from 'hangul-js';
import { installMarketingTyping, fullText, splitLine } from '../../../marketing/src/typing.js';

let cleanup;
let motion;
let intersection;
let visibility;
const text = node => ['before', 'blue', 'after'].map(part => node.querySelector(`[data-typing-${part}]`).textContent).join('');
const markup = (label, line, hero = false) => `<h2 aria-label="${label}" ${hero ? 'data-marketing-typing' : 'data-marketing-section-title'}>
    <span data-typing-line aria-hidden="true"><span data-typing-before>${line.before}</span><span data-typing-blue>${line.blue}</span><span data-typing-after>${line.after}</span></span></h2>`;
const show = (node, isIntersecting = true) => intersection([{ target: node, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }]);

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback) { intersection = callback; }
        observe() {}
        disconnect() {}
    });
    motion = new EventTarget();
    motion.matches = false;
    visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.body.innerHTML = markup('가게 탐색', splitLine('한눈에 찾아보세요', '한눈에'))
        + markup('숨겨진 모바일 제목', splitLine('다음 제목', '제목'));
    cleanup = installMarketingTyping(document, motion, Hangul);
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('types only the visible heading in Korean composition steps and preserves its accessible name', () => {
    const [heading, hidden] = document.querySelectorAll('h2');
    show(heading);
    expect(text(heading)).toBe('');
    vi.advanceTimersByTime(180);
    expect(text(heading)).toBe('ㅎ');
    expect(heading.getAttribute('aria-label')).toBe('가게 탐색');
    expect(text(hidden)).toBe('다음 제목');
    vi.advanceTimersByTime(5000);
    expect(text(heading)).toBe('한눈에 찾아보세요');
    expect(heading.querySelector('[data-typing-blue]').textContent).toBe('한눈에');
    expect(vi.getTimerCount()).toBe(0);
});

it('cancels unfinished typing outside the viewport and restarts once on a return visit', () => {
    const heading = document.querySelector('h2');
    show(heading);
    vi.advanceTimersByTime(300);
    show(heading, false);
    expect(text(heading)).toBe('한눈에 찾아보세요');
    expect(vi.getTimerCount()).toBe(0);
    show(heading);
    vi.advanceTimersByTime(300);
    const partial = text(heading);
    show(heading);
    expect(text(heading)).toBe(partial);
    vi.advanceTimersByTime(5000);
    expect(text(heading)).toBe('한눈에 찾아보세요');
});

it('finishes immediately under reduced motion and suspends timers in hidden or cached documents', () => {
    const heading = document.querySelector('h2');
    show(heading);
    vi.advanceTimersByTime(300);
    motion.matches = true;
    motion.dispatchEvent(new Event('change'));
    expect(text(heading)).toBe('한눈에 찾아보세요');
    expect(vi.getTimerCount()).toBe(0);
    motion.matches = false;
    motion.dispatchEvent(new Event('change'));
    visibility.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    visibility.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(1);
    window.dispatchEvent(new Event('pagehide'));
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('pageshow'));
    expect(vi.getTimerCount()).toBe(1);
});

it('types multiple title lines in order and loops the hero only while it is visible', () => {
    cleanup();
    document.body.innerHTML = markup('두 줄 제목', splitLine('예약은 딱', ''))
        + markup('히어로', { before: '버튼 ', blue: '클릭 한 번', after: '으로' }, true);
    const [heading, hero] = document.querySelectorAll('h2');
    heading.insertAdjacentHTML('beforeend', '<span data-typing-line><span data-typing-before></span><span data-typing-blue>세 번의 클릭</span><span data-typing-after>으로</span></span>');
    cleanup = installMarketingTyping(document, motion, Hangul);
    show(heading);
    const lines = heading.querySelectorAll('[data-typing-line]');
    vi.advanceTimersByTime(400);
    expect(text(lines[0])).not.toBe('');
    expect(text(lines[1])).toBe('');
    vi.advanceTimersByTime(5000);
    expect(text(lines[0])).toBe('예약은 딱');
    expect(text(lines[1])).toBe('세 번의 클릭으로');
    show(hero);
    vi.advanceTimersByTime(3000);
    expect(text(hero)).not.toBe(fullText({ before: '버튼 ', blue: '클릭 한 번', after: '으로' }));
    show(hero, false);
    expect(vi.getTimerCount()).toBe(0);
});
