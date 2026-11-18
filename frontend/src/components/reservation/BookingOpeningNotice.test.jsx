import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BookingOpeningNotice from './BookingOpeningNotice';

const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
afterEach(() => {
    vi.useRealTimers();
    if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
    else delete HTMLElement.prototype.animate;
});

it('rolls changed digits upward on the server clock and refreshes once at opening', async () => {
    vi.useFakeTimers();
    const animate = vi.fn(() => ({ cancel: vi.fn(), playState: 'running', pending: false }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    const opensAt = '2026-12-05T20:00:00';
    const deadline = Date.parse(`${opensAt}+09:00`);
    const observedAt = deadline + 60_000;
    vi.setSystemTime(observedAt);
    const onOpen = vi.fn();
    render(<BookingOpeningNotice opening={{ opensAt, from: '2026-12-06', to: '2026-12-12', serverTime: deadline - 2_000 }}
        observedAt={observedAt} onOpen={onOpen} />);

    expect(screen.getByRole('timer', { name: '예약 오픈까지 00:00:02' })).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByRole('timer', { name: '예약 오픈까지 00:00:01' })).toBeInTheDocument();
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[0][0][0].transform).toBe('translateY(70%) rotateX(-25deg)');
    expect(animate.mock.calls[1][0][1].transform).toBe('translateY(-70%) rotateX(25deg)');
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
});
