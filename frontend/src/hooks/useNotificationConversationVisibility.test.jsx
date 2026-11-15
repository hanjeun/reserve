import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import useNotificationConversationVisibility from './useNotificationConversationVisibility';

const prefix = 'reserve:notification-conversation-hidden:v1:';
afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(prefix + 101);
    localStorage.removeItem(prefix + 102);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
});

it('shares the preference within a member and keeps another member visible', () => {
    const first = renderHook(({ id }) => useNotificationConversationVisibility(id), { initialProps: { id: 101 } });
    const second = renderHook(() => useNotificationConversationVisibility(101));
    act(() => first.result.current.setHidden(true));
    expect(second.result.current.hidden).toBe(true);
    first.rerender({ id: 102 });
    expect(first.result.current.hidden).toBe(false);
    first.rerender({ id: 101 });
    expect(first.result.current.hidden).toBe(true);
    act(() => first.result.current.setHidden(false));
    expect(second.result.current.hidden).toBe(false);
});

it('reflects changes and removal in another tab without reading chat content', () => {
    const { result } = renderHook(() => useNotificationConversationVisibility(101));
    act(() => {
        localStorage.setItem(prefix + 101, 'true');
        window.dispatchEvent(new StorageEvent('storage', { key: prefix + 101, newValue: 'true' }));
    });
    expect(result.current.hidden).toBe(true);
    act(() => {
        localStorage.removeItem(prefix + 101);
        window.dispatchEvent(new StorageEvent('storage', { key: prefix + 101, newValue: null }));
    });
    expect(result.current.hidden).toBe(false);
});

it('keeps hiding usable when storage is full and does not persist an anonymous preference', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result, rerender } = renderHook(({ id }) => useNotificationConversationVisibility(id), { initialProps: { id: 101 } });
    act(() => result.current.setHidden(true));
    expect(result.current.hidden).toBe(true);
    rerender({ id: null });
    act(() => result.current.setHidden(true));
    expect(result.current.hidden).toBe(false);
});
