import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdmissionWaitingStatus from './AdmissionWaitingStatus';

const preferences = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => preferences.reduced }));
let animate;
let descriptor;
beforeEach(() => {
    preferences.reduced = false;
    animate = vi.fn(function () { return { cancel: vi.fn(), playState: 'finished', pending: false }; });
    descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor);
    else delete HTMLElement.prototype.animate;
    vi.restoreAllMocks();
});
const content = position => <AdmissionWaitingStatus position={position} caption="내 대기 순번" description="차례가 되면 예약을 계속할 수 있어요." appearance={{}} />;

it('rolls only digits and changes the message once when entering the near group', () => {
    const view = render(content(101));
    const message = screen.getByText('차례가 되면 예약을 계속할 수 있어요.');
    const suffix = screen.getByText('번째');
    const numeric = view.container.querySelector('.reserve-admission-rank-number');
    expect(suffix.parentElement).toHaveStyle({ alignItems: 'center' });
    expect(numeric).toHaveStyle({ alignItems: 'center' });
    expect(numeric.style.width).toBe('3ch');
    expect(animate.mock.contexts.filter(node => node === message)).toHaveLength(0);
    for (const position of [100, 99, 98, 11, 10, 9, 8, 3, 2, 1]) {
        view.rerender(content(position));
        expect(view.container.querySelector('.reserve-admission-rank')).toHaveAttribute('data-rank', String(position));
        expect(numeric.style.width).toBe(`${String(position).length}ch`);
        expect(screen.getByText('번째')).toBe(suffix);
        expect(suffix.closest('.reserve-rolling-field-value')).toBeNull();
        expect([...numeric.querySelectorAll('.reserve-rolling-field-value')].map(cell => cell.children[0].textContent).join('')).toBe(String(position));
        expect(numeric.querySelector('[aria-hidden="true"]').textContent).not.toContain('번째');
        expect(animate.mock.contexts.filter(node => node === message)).toHaveLength(position <= 3 ? 1 : 0);
        if (position <= 3) expect(screen.getByText('곧 입장할 차례예요.')).toBe(message);
    }
    expect(numeric.style.transition).toContain('width');
    expect(suffix.parentElement).toHaveStyle({ fontVariantNumeric: 'tabular-nums' });
    expect(animate.mock.calls.find((_call, index) => animate.mock.contexts[index] === message)[0][0])
        .toMatchObject({ transform: 'translateY(-8px)' });
});

it('keeps the accessible text current without motion when reduced motion is enabled', () => {
    preferences.reduced = true;
    const view = render(content(100));
    view.rerender(content(99)); view.rerender(content(3)); view.rerender(content(1));
    expect(screen.getByText('곧 입장할 차례예요.')).toBeInTheDocument();
    expect(view.container.querySelector('.reserve-admission-rank')).toHaveAttribute('data-rank', '1');
    const numeric = view.container.querySelector('.reserve-admission-rank-number');
    expect(numeric.style.width).toBe('1ch');
    expect(numeric).toHaveStyle({ transition: 'none' });
    expect(animate).not.toHaveBeenCalled();
});


it('moves only changed rank digits down while keeping the label and unchanged places still', () => {
    const view = render(content(123));
    const caption = screen.getByText('내 대기 순번');
    const suffix = screen.getByText('번째');
    const cells = [...view.container.querySelectorAll('.reserve-rolling-field-value')];
    view.rerender(content(122));
    const changed = animate.mock.contexts;
    expect(changed).toEqual([cells[2].children[0], cells[2].children[1]]);
    expect(animate.mock.calls[0][0][0].transform).toBe('translateY(-70%) rotateX(25deg)');
    expect(animate.mock.calls[1][0][1].transform).toBe('translateY(70%) rotateX(-25deg)');
    expect(screen.getByText('내 대기 순번')).toBe(caption);
    expect(screen.getByText('번째')).toBe(suffix);
    animate.mockClear();
    view.rerender(content(123));
    expect(animate.mock.contexts).toEqual([cells[2].children[0], cells[2].children[1]]);
    expect(animate.mock.calls[0][0][0].transform).toBe('translateY(-70%) rotateX(25deg)');
});
