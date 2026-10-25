import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReservationEntryNotice from './ReservationEntryNotice';

const message = vi.hoisted(() => ({ open: vi.fn(), destroy: vi.fn() }));
const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message }) }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => preference.reduced }));
let animate;
let descriptor;
beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T03:00:00Z')); vi.clearAllMocks();
    preference.reduced = false;
    animate = vi.fn(() => ({ cancel: vi.fn() }));
    descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => {
    vi.useRealTimers();
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor);
    else delete HTMLElement.prototype.animate;
});

it('opens one persistent message and updates its existing timer without reopening or live announcements', () => {
    const expiresAt = Date.now() + 180000;
    const notice = render(<ReservationEntryNotice expiresAt={expiresAt} />);
    expect(message.open).toHaveBeenCalledOnce();
    const options = message.open.mock.calls[0][0];
    expect(options).toMatchObject({ type: 'info', duration: 0 });
    const content = render(options.content);
    const timer = screen.getByRole('timer', { name: '예약 입장 남은 시간' });
    const bar = timer.parentElement;
    expect(bar).toHaveStyle({ whiteSpace: 'nowrap', display: 'inline-flex' });
    expect(bar).toHaveTextContent('남은3:00· 자리 미확보');
    expect(timer).toHaveTextContent('3:00');
    expect(timer).toHaveAttribute('aria-live', 'off');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('timer')).toBe(timer);
    expect(timer.parentElement).toBe(bar);
    expect(timer).toHaveTextContent('2:58');
    expect(animate).not.toHaveBeenCalled();
    notice.rerender(<ReservationEntryNotice expiresAt={expiresAt} />);
    expect(message.open).toHaveBeenCalledOnce();
    expect(message.destroy).not.toHaveBeenCalled();
    notice.unmount(); content.unmount();
    expect(message.destroy).toHaveBeenCalledWith(options.key);
    expect(vi.getTimerCount()).toBe(0);
});

it('keeps the timer parts and message fixed while seconds change without motion', () => {
    const notice = render(<ReservationEntryNotice expiresAt={Date.now() + 151000} />);
    const content = render(message.open.mock.calls[0][0].content);
    const timer = screen.getByRole('timer');
    const parts = [...timer.children];
    const colon = parts[1];
    expect(timer).toHaveTextContent('2:31');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(timer).toHaveTextContent('2:30');
    expect(animate).not.toHaveBeenCalled();
    expect(timer.children[1]).toBe(colon);
    expect([...timer.children]).toEqual(parts);
    expect(message.open).toHaveBeenCalledOnce();
    notice.unmount(); content.unmount();
});

it('updates across a minute boundary without motion', () => {
    const notice = render(<ReservationEntryNotice expiresAt={Date.now() + 120000} />);
    const content = render(message.open.mock.calls[0][0].content);
    const timer = screen.getByRole('timer');
    const parts = [...timer.children];
    act(() => { vi.advanceTimersByTime(1000); });
    expect(timer).toHaveTextContent('1:59');
    expect(animate).not.toHaveBeenCalled();
    expect([...timer.children]).toEqual(parts);
    expect(message.open).toHaveBeenCalledOnce();
    notice.unmount(); content.unmount();
});

it('updates only the time without motion when reduced motion is enabled', () => {
    preference.reduced = true;
    const notice = render(<ReservationEntryNotice expiresAt={Date.now() + 180000} />);
    const content = render(message.open.mock.calls[0][0].content);
    const timer = screen.getByRole('timer');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(timer).toHaveTextContent('2:59');
    expect(animate).not.toHaveBeenCalled();
    expect(message.open).toHaveBeenCalledOnce();
    notice.unmount(); content.unmount();
});

it('removes an expired notice and does not open an already expired grant', () => {
    const notice = render(<ReservationEntryNotice expiresAt={Date.now() + 1000} />);
    const options = message.open.mock.calls[0][0];
    const content = render(options.content);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(message.destroy).toHaveBeenCalledWith(options.key);
    expect(vi.getTimerCount()).toBe(0);
    notice.unmount(); content.unmount(); message.open.mockClear();
    render(<ReservationEntryNotice expiresAt={Date.now()} />);
    expect(message.open).not.toHaveBeenCalled();
});

it('replaces only its own keyed message when another grant is explicitly received', () => {
    const now = Date.now();
    const notice = render(<ReservationEntryNotice expiresAt={now + 1000} />);
    const first = message.open.mock.calls[0][0];
    notice.rerender(<ReservationEntryNotice expiresAt={now + 5000} />);
    expect(message.destroy).toHaveBeenCalledWith(first.key);
    expect(message.open).toHaveBeenCalledTimes(2);
    expect(message.open.mock.calls[1][0].key).toBe(first.key);
    notice.unmount();
    expect(message.destroy.mock.calls.every(([key]) => key === first.key)).toBe(true);
});

it('restores evicted content with the same key and original deadline, without relying on onClose', async () => {
    const notice = render(<ReservationEntryNotice expiresAt={Date.now() + 180000} />);
    const first = message.open.mock.calls[0][0];
    const content = render(first.content);
    act(() => { vi.advanceTimersByTime(2000); });
    await act(async () => { content.unmount(); await Promise.resolve(); });
    expect(message.open).toHaveBeenCalledTimes(2);
    expect(message.open.mock.calls[1][0]).toMatchObject({ key: first.key, duration: 0 });
    const restored = render(message.open.mock.calls[1][0].content);
    expect(screen.getByRole('timer')).toHaveTextContent('2:58');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('timer')).toHaveTextContent('2:57');
    expect(message.open).toHaveBeenCalledTimes(2);
    notice.unmount(); restored.unmount();
    expect(vi.getTimerCount()).toBe(0);
});

it('does not restore an evicted notice after its parent is cleaned up', async () => {
    const notice = render(<ReservationEntryNotice expiresAt={Date.now() + 180000} />);
    const content = render(message.open.mock.calls[0][0].content);
    await act(async () => { content.unmount(); notice.unmount(); await Promise.resolve(); });
    expect(message.open).toHaveBeenCalledOnce();
    expect(message.destroy).toHaveBeenCalledOnce();
});

it('does not restore if the deadline passes before the queued recovery', async () => {
    const expiresAt = Date.now() + 1000;
    const notice = render(<ReservationEntryNotice expiresAt={expiresAt} />);
    const content = render(message.open.mock.calls[0][0].content);
    await act(async () => { content.unmount(); vi.setSystemTime(expiresAt); await Promise.resolve(); });
    expect(message.open).toHaveBeenCalledOnce();
    expect(message.destroy).toHaveBeenCalledOnce();
    notice.unmount();
});

it('does not reopen for StrictMode effect replay or ordinary countdown renders', async () => {
    const notice = render(<ReservationEntryNotice expiresAt={Date.now() + 180000} />);
    const content = render(<StrictMode>{message.open.mock.calls[0][0].content}</StrictMode>);
    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(message.open).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    notice.unmount(); content.unmount();
});
