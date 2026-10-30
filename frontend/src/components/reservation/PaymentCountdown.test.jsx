import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PaymentCountdown from './PaymentCountdown';

const base = { status: 'PENDING', depositAmount: 10000, depositPaid: false, allowLatePayment: false,
    paymentDeadline: '2026-10-27T03:10:00Z' };
let animate;
let animateDescriptor;
beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T03:00:00Z'));
    animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    animate = vi.fn(() => ({ cancel: vi.fn(), playState: 'finished', pending: false }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
    cleanup(); vi.useRealTimers(); vi.restoreAllMocks();
    if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor); else delete HTMLElement.prototype.animate;
});
it('서버 마감까지 계산하고 바뀌는 숫자 자리만 아래로 움직여요', () => {
    const view = render(<PaymentCountdown reservation={base} />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAccessibleName('결제 남은 시간 10:00');
    expect(timer).toHaveAttribute('aria-live', 'off');
    const digit = view.container.querySelectorAll('.reserve-rolling-field-value')[0];
    const colon = [...view.container.querySelectorAll('span')].find(node => node.textContent === ':' && node.childElementCount === 0);
    expect(animate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(timer).toHaveAccessibleName('결제 남은 시간 09:59');
    expect(view.container.querySelectorAll('.reserve-rolling-field-value')[0]).toBe(digit);
    expect(colon.isConnected).toBe(true);
    animate.mockClear();
    act(() => vi.advanceTimersByTime(1000));
    expect(timer).toHaveAccessibleName('결제 남은 시간 09:58');
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[0][0][0].transform).toContain('translateY(-70%)');
});
it('숨겨진 탭에서 돌아오면 실제 경과 시간을 따라가며 기한을 늘리지 않아요', () => {
    render(<PaymentCountdown reservation={base} />);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { vi.setSystemTime(new Date('2026-10-27T03:07:12Z')); vi.advanceTimersByTime(1000); });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByRole('timer')).toHaveAccessibleName('결제 남은 시간 02:47');
});
it('기한이 지나도 예약 상태를 바꾸거나 음수 시간을 표시하지 않아요', () => {
    render(<PaymentCountdown reservation={{ ...base, paymentDeadline: '2026-10-27T03:00:01Z' }} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('timer')).toHaveAccessibleName('결제 기한 지남');
    expect(vi.getTimerCount()).toBe(0);
    expect(base.status).toBe('PENDING');
});
it('시간대 없는 값이나 마감 없는 예약에 임의의 결제 시간을 만들지 않아요', () => {
    const { rerender } = render(<PaymentCountdown reservation={{ ...base, paymentDeadline: '2026-10-27T12:10:00' }} />);
    expect(screen.queryByRole('timer')).toBeNull();
    for (const changes of [{ paymentDeadline: null }, { depositPaid: true }, { allowLatePayment: true }, { status: 'CANCELLED' }, { depositAmount: 0 }]) {
        rerender(<PaymentCountdown reservation={{ ...base, ...changes }} />);
        expect(screen.queryByRole('timer')).toBeNull();
    }
});
it('오프셋이 있는 마감도 같은 남은 시간으로 표시해요', () => {
    render(<PaymentCountdown reservation={{ ...base, paymentDeadline: '2026-10-27T12:10:00+09:00' }} />);
    expect(screen.getByRole('timer')).toHaveAccessibleName('결제 남은 시간 10:00');
});

it('1분 경계에서 임박 상태로 바뀌고 만료 문구만 공용 모션으로 전환해요', () => {
    render(<PaymentCountdown reservation={{ ...base, paymentDeadline: '2026-10-27T03:01:01Z' }} />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('data-state', 'remaining');
    const label = timer.querySelector('.reserve-payment-countdown-label');
    act(() => vi.advanceTimersByTime(1000));
    expect(timer).toHaveAttribute('data-state', 'urgent');
    expect(timer).toHaveAccessibleName('결제 남은 시간 01:00');
    expect(label.isConnected).toBe(true);
    animate.mockClear();
    act(() => vi.advanceTimersByTime(60000));
    expect(timer).toHaveAttribute('data-state', 'expired');
    expect(timer).toHaveTextContent('결제만료');
    expect(label.isConnected).toBe(true);
    expect(animate).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ transform: 'translateY(-8px)' }),
    ]), expect.objectContaining({ duration: 220 }));
    expect(vi.getTimerCount()).toBe(0);
});
