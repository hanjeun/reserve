import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RollingFieldValue from '../RollingFieldValue';

const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../hooks/useReducedMotion', () => ({ default: () => preference.reduced }));

let animateDescriptor;
let animate;
beforeEach(() => {
    preference.reduced = false;
    animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    animate = vi.fn(() => ({ cancel: vi.fn(), playState: 'running', pending: false }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => {
    cleanup();
    if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
    else delete HTMLElement.prototype.animate;
});

describe('field replacement motion', () => {
    it('shows the first date immediately and rolls only a later date replacement', () => {
        const view = render(<RollingFieldValue>날짜 선택</RollingFieldValue>);
        view.rerender(<RollingFieldValue value={1}>10월 14일</RollingFieldValue>);
        expect(animate).not.toHaveBeenCalled();
        expect(view.container).toHaveTextContent('10월 14일');

        view.rerender(<RollingFieldValue value={2}>10월 15일</RollingFieldValue>);
        expect(animate).toHaveBeenCalledTimes(2);
        expect(view.container.querySelector('[aria-hidden="true"]')).toHaveTextContent('10월 14일');
        expect(animate.mock.calls[0][0][0].transform).toBe('translateY(70%) rotateX(-25deg)');
    });

    it('cancels a replacement on clear and treats the next choice as a new first value', () => {
        const view = render(<RollingFieldValue value="2026-10-14">10월 14일</RollingFieldValue>);
        view.rerender(<RollingFieldValue value="2026-10-15">10월 15일</RollingFieldValue>);
        const motions = animate.mock.results.map(result => result.value);
        view.rerender(<RollingFieldValue value="">날짜 선택</RollingFieldValue>);
        expect(motions.every(motion => motion.cancel.mock.calls.length === 1)).toBe(true);
        view.rerender(<RollingFieldValue value="2026-10-16">10월 16일</RollingFieldValue>);
        expect(animate).toHaveBeenCalledTimes(2);
        expect(view.container.querySelector('[aria-hidden="true"]')).toHaveTextContent('');
    });

    it('keeps zero as an existing value and reverses motion when a number decreases', () => {
        const view = render(<RollingFieldValue value={0}>0명</RollingFieldValue>);
        view.rerender(<RollingFieldValue value={1}>1명</RollingFieldValue>);
        act(() => animate.mock.results[0].value.onfinish());
        view.rerender(<RollingFieldValue value={0}>0명</RollingFieldValue>);
        expect(animate).toHaveBeenCalledTimes(4);
        expect(animate.mock.calls[2][0][0].transform).toBe('translateY(-70%) rotateX(25deg)');
    });

    it('keeps modal-close timing for replacements and skips all motion with reduced motion', () => {
        const view = render(<RollingFieldValue value={1} modalOpen>10월 14일</RollingFieldValue>);
        view.rerender(<RollingFieldValue value={2}>10월 15일</RollingFieldValue>);
        expect(animate.mock.calls[0][1]).toMatchObject({ duration: 200, delay: 200 });
        preference.reduced = true;
        view.rerender(<RollingFieldValue value={3}>10월 16일</RollingFieldValue>);
        expect(animate).toHaveBeenCalledTimes(2);
        expect(view.container).toHaveTextContent('10월 16일');
    });
});
