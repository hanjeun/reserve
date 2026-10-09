import { render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StateIllustration from '../StateIllustration';

vi.mock('../../../hooks/useReducedMotion', () => ({ default: () => false }));
vi.mock('../../../hooks/useIllustrationMotion', () => ({ default: () => vi.fn() }));

let animateDescriptor;
beforeEach(() => {
    animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn() });
});
afterEach(() => {
    if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
    else delete HTMLElement.prototype.animate;
});

it('rechecks action, hidden and inert ancestors while keeping the same illustration node', () => {
    const picture = props => <div {...props}><StateIllustration name="empty-news" /></div>;
    const view = render(picture({}));
    const host = view.container.querySelector('.reserve-state-illustration');
    expect(host).toHaveAttribute('role', 'button');

    for (const ancestor of [{ role: 'button' }, { role: 'link' }, { 'aria-hidden': 'true' }, { inert: true }]) {
        view.rerender(picture(ancestor));
        expect(view.container.querySelector('.reserve-state-illustration')).toBe(host);
        expect(host).not.toHaveAttribute('role');
        expect(host).not.toHaveAttribute('tabindex');
        view.rerender(picture({}));
        expect(host).toHaveAttribute('role', 'button');
    }
});
