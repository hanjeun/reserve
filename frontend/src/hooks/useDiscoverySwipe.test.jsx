import { useRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useDiscoverySwipe from './useDiscoverySwipe';

function Page({ openCard }) {
    const content = useRef(null);
    const location = useLocation();
    useDiscoverySwipe(content);
    return <main ref={content}>
        <output aria-label="현재 경로">{location.pathname}</output>
        <a href="/store/example" className="reserve-store-card-hit"
            onClick={event => { event.preventDefault(); openCard(); }}>가게 카드</a>
        <div data-discovery-swipe-ignore="true">배너</div>
        <input aria-label="검색" />
    </main>;
}

const show = (path = '/benefits') => {
    const openCard = vi.fn();
    render(<MemoryRouter initialEntries={[path]}><Page openCard={openCard} /></MemoryRouter>);
    return { openCard, card: screen.getByText('가게 카드'), content: screen.getByRole('main') };
};
function dispatch(target, type, properties) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.entries(properties).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
    return fireEvent(target, event);
}
function touch(target, type, clientX, clientY, timeStamp) {
    const point = { identifier: 1, clientX, clientY };
    const ended = type === 'touchend';
    return dispatch(target, type, { timeStamp, touches: ended ? [] : [point], changedTouches: [point] });
}
function mouse(target, type, clientX, timeStamp) {
    return dispatch(target, type, { timeStamp, pointerType: 'mouse', pointerId: 1, button: 0,
        buttons: type === 'pointerup' ? 0 : 1, clientX, clientY: 100 });
}
beforeEach(() => { vi.stubGlobal('innerWidth', 390); });
afterEach(() => vi.unstubAllGlobals());

it('keeps a horizontal touch after pointer cancellation and changes one tab on a short flick', async () => {
    const { card, content, openCard } = show();
    touch(card, 'touchstart', 260, 100, 10);
    expect(touch(card, 'touchmove', 230, 101, 45)).toBe(true);
    dispatch(card, 'pointercancel', { pointerType: 'touch', pointerId: 1 });
    await waitFor(() => expect(content).toHaveClass('reserve-discovery-swipe-dragging'));
    expect(parseFloat(content.style.getPropertyValue('--reserve-discovery-swipe-x'))).toBeLessThan(0);
    touch(card, 'touchend', 220, 101, 75);
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/waiting');
    expect(content).not.toHaveClass('reserve-discovery-swipe-dragging');
    expect(fireEvent.click(card, { detail: 1 })).toBe(false);
    expect(openCard).not.toHaveBeenCalled();
});

it('lets a mostly vertical flick continue after a diagonal start', () => {
    const { card, content } = show();
    touch(card, 'touchstart', 260, 100, 10);
    expect(touch(card, 'touchmove', 239, 108, 25)).toBe(true);
    expect(touch(card, 'touchmove', 238, 146, 42)).toBe(true);
    expect(touch(card, 'touchmove', 234, 250, 67)).toBe(true);
    touch(card, 'touchend', 234, 250, 75);
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/benefits');
    expect(content).not.toHaveClass('reserve-discovery-swipe-dragging');
});

it('returns a short mouse drag to its place and distinguishes the next click', async () => {
    const { card, content, openCard } = show();
    mouse(card, 'pointerdown', 240, 10);
    expect(mouse(window, 'pointermove', 202, 240)).toBe(false);
    await waitFor(() => expect(content).toHaveClass('reserve-discovery-swipe-dragging'));
    mouse(window, 'pointerup', 202, 450);
    expect(content).toHaveClass('reserve-discovery-swipe-settling');
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/benefits');
    fireEvent.click(card, { detail: 1 });
    expect(openCard).not.toHaveBeenCalled();
    mouse(card, 'pointerdown', 230, 470);
    mouse(window, 'pointerup', 230, 480);
    fireEvent.click(card, { detail: 1 });
    expect(openCard).toHaveBeenCalledOnce();
});

it.each(['vertical', 'banner', 'input', 'edge', 'wide'])('preserves the %s gesture', scenario => {
    const { card, content } = show();
    const target = scenario === 'banner' ? screen.getByText('배너')
        : scenario === 'input' ? screen.getByRole('textbox') : card;
    if (scenario === 'wide') vi.stubGlobal('innerWidth', 1280);
    const x = scenario === 'edge' ? 16 : 260;
    const y = scenario === 'vertical' ? 230 : 100;
    touch(target, 'touchstart', x, 100, 10);
    expect(touch(target, 'touchmove', x - 110, y, 45)).toBe(true);
    touch(target, 'touchend', x - 110, y, 75);
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/benefits');
    expect(content).not.toHaveClass('reserve-discovery-swipe-dragging');
});
