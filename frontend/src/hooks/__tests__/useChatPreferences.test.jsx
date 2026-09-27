import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import useChatPreferences, { CHAT_COLOR_OPTIONS } from '../useChatPreferences';

describe('one chat preference source for settings and bubbles', () => {
    afterEach(() => {
        const hook = renderHook(() => useChatPreferences());
        act(() => hook.result.current.setColor('blue'));
        hook.unmount();
    });
    it('immediately updates both consumers and validates stored values', () => {
        const first = renderHook(() => useChatPreferences());
        const second = renderHook(() => useChatPreferences());
        act(() => first.result.current.setColor('teal'));
        expect(second.result.current.color).toBe('teal');
        expect(localStorage.getItem('reserve:chat-color')).toBe('teal');
        act(() => second.result.current.setColor('malicious-css'));
        expect(first.result.current.color).toBe('blue');
    });
    it('synchronizes cross-tab storage changes without changing the site accent', () => {
        localStorage.setItem('reserve:accent', 'rose');
        const hook = renderHook(() => useChatPreferences());
        act(() => {
            localStorage.setItem('reserve:chat-color', 'neutral');
            window.dispatchEvent(new StorageEvent('storage', { key: 'reserve:chat-color', storageArea: localStorage }));
        });
        expect(hook.result.current.color).toBe('neutral');
        expect(localStorage.getItem('reserve:accent')).toBe('rose');
    });
    it('keeps all offered bubble colors readable with white text', () => {
        const luminance = color => {
            const channels = color.slice(1).match(/../g).map(hex => Number.parseInt(hex, 16) / 255);
            const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
            return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
        };
        for (const option of CHAT_COLOR_OPTIONS) expect(1.05 / (luminance(option.background) + .05)).toBeGreaterThanOrEqual(4.5);
    });
});
