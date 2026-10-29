import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import useExitAnimation from './useExitAnimation';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('retains the closing DOM until a painted exit receives its full duration', () => {
    vi.useFakeTimers();
    const frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { result, rerender } = renderHook(({ open }) => useExitAnimation(open, 180, true), { initialProps: { open: true } });
    rerender({ open: false });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.shouldRender).toBe(true);
    act(() => { frames.shift()(0); frames.shift()(16); vi.advanceTimersByTime(179); });
    expect(result.current.shouldRender).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.shouldRender).toBe(false);
});

it('cancels a pending paint when the same control reopens', () => {
    vi.useFakeTimers();
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(23);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { result, rerender } = renderHook(({ open }) => useExitAnimation(open, 180, true), { initialProps: { open: true } });
    rerender({ open: false });
    expect(frame).toHaveBeenCalledOnce();
    rerender({ open: true });
    expect(cancel).toHaveBeenCalledWith(23);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toEqual({ shouldRender: true, isClosing: false });
});

it('preserves the existing duration for callers that do not wait for paint', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ open }) => useExitAnimation(open, 180), { initialProps: { open: true } });
    rerender({ open: false });
    act(() => { vi.advanceTimersByTime(180); });
    expect(result.current.shouldRender).toBe(false);
});
