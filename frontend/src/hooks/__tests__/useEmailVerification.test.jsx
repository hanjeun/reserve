import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useEmailVerification from '../useEmailVerification';

const api = vi.hoisted(() => ({ post: vi.fn() }));
const feedback = vi.hoisted(() => ({ message: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../api/axios', () => ({ default: api }));
vi.mock('../useMessage', () => ({ default: () => feedback }));
const storageKey = 'reserve_email_verify';

describe('email verification restoration and expiry', () => {
    let form;
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-30T13:30:00Z'));
        vi.clearAllMocks();
        vi.spyOn(globalThis, 'setInterval');
        vi.spyOn(globalThis, 'clearInterval');
        localStorage.clear();
        form = {
            setFieldValue: vi.fn(), setFields: vi.fn(), validateFields: vi.fn().mockResolvedValue({}),
            getFieldValue: vi.fn(name => name === 'email' ? 'member@example.com' : '123456'),
        };
        api.post.mockResolvedValue({});
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
    const show = options => renderHook(() => useEmailVerification({
        form, sendEndpoint: '/send', verifyEndpoint: '/verify', ...options,
    }), { wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode> });

    it('restores the pending email and timer immediately without sending another code', () => {
        localStorage.setItem(storageKey, JSON.stringify({ endTime: Date.now() + 120000, email: 'pending@example.com' }));
        const { result, unmount } = show();
        expect(result.current.isCodeSent).toBe(true);
        expect(result.current.timeLeft).toBe(120);
        expect(form.setFieldValue).toHaveBeenCalledWith('email', 'pending@example.com');
        expect(api.post).not.toHaveBeenCalled();
        expect(setInterval).toHaveBeenCalled();
        for (const timer of setInterval.mock.results.slice(0, -1)) {
            expect(clearInterval).toHaveBeenCalledWith(timer.value);
        }
        act(() => vi.advanceTimersByTime(120000));
        expect(result.current.timerInfo.text).toBe('시간 만료 — 재발송해주세요');
        expect(localStorage.getItem(storageKey)).toBeNull();
        unmount();
        expect(clearInterval).toHaveBeenCalledWith(setInterval.mock.results.at(-1).value);
    });

    it.each(['expired', 'malformed'])('does not restore %s stored verification data', type => {
        localStorage.setItem(storageKey, JSON.stringify({ endTime: type === 'expired' ? Date.now() - 1000 : 'invalid' }));
        const { result } = show();
        expect(result.current.isCodeSent).toBe(false);
        expect(result.current.timeLeft).toBe(0);
        expect(result.current.timerInfo).toBeNull();
        expect(localStorage.getItem(storageKey)).toBeNull();
    });

    it('recalculates absolute expiry after returning from a throttled background tab', () => {
        localStorage.setItem(storageKey, JSON.stringify({ endTime: Date.now() + 120000, email: 'pending@example.com' }));
        const { result } = show();
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        act(() => {
            vi.setSystemTime(new Date('2026-09-30T13:33:00Z'));
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(result.current.timeLeft).toBe(0);
        expect(result.current.isCodeSent).toBe(true);
        expect(localStorage.getItem(storageKey)).toBeNull();
    });

    it('starts a fresh five-minute timer on send and clears it only after verified success', async () => {
        const onVerified = vi.fn();
        const { result } = show({ onVerified });
        await act(async () => { await result.current.sendCode(); });
        expect(result.current.timeLeft).toBe(300);
        expect(result.current.isCodeSent).toBe(true);
        expect(api.post).toHaveBeenCalledWith('/send', { email: 'member@example.com' });
        await act(async () => { await result.current.verifyCode(); });
        expect(api.post).toHaveBeenCalledWith('/verify', { email: 'member@example.com', code: '123456' });
        expect(result.current.isVerified).toBe(true);
        expect(result.current.timerInfo).toBeNull();
        expect(onVerified).toHaveBeenCalledWith('member@example.com');
        expect(localStorage.getItem(storageKey)).toBeNull();
        expect(clearInterval).toHaveBeenCalledWith(setInterval.mock.results.at(-1).value);
    });
});
