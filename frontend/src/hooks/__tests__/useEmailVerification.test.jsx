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
        api.post.mockImplementation(async endpoint => ({
            expiresAt: '2026-09-30T13:35:00Z',
            ...(endpoint === '/verify' ? { verificationTicket: 'a'.repeat(43) } : {}),
        }));
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

    it('keeps the server deadline after verification and stores the signup proof only in memory', async () => {
        const onVerified = vi.fn();
        const { result } = show({ onVerified });
        await act(async () => { await result.current.sendCode(); });
        expect(result.current.timeLeft).toBe(300);
        expect(result.current.isCodeSent).toBe(true);
        expect(api.post).toHaveBeenCalledWith('/send', { email: 'member@example.com' });
        await act(async () => { await result.current.verifyCode(); });
        expect(api.post).toHaveBeenCalledWith('/verify', { email: 'member@example.com', code: '123456' });
        expect(result.current.isVerified).toBe(true);
        expect(result.current.timerInfo.text).toBe('가입까지 남은 시간 05:00');
        expect(result.current.getVerificationTicket()).toBe('a'.repeat(43));
        expect(onVerified).toHaveBeenCalledWith('member@example.com');
        expect(localStorage.getItem(storageKey)).toBeNull();
        act(() => vi.advanceTimersByTime(300000));
        expect(result.current.isVerified).toBe(false);
        act(() => { expect(result.current.getVerificationTicket()).toBeNull(); });
    });

    it('uses the original server expiry instead of restarting five minutes after the response', async () => {
        api.post.mockResolvedValue({ expiresAt: '2026-09-30T13:32:00Z' });
        const { result } = show();
        await act(async () => { await result.current.sendCode(); });
        expect(result.current.timeLeft).toBe(120);
        expect(JSON.parse(localStorage.getItem(storageKey)).endTime).toBe(Date.parse('2026-09-30T13:32:00Z'));
    });

    it('rejects a successful-looking response without a signup proof', async () => {
        const { result } = show();
        await act(async () => { await result.current.sendCode(); });
        api.post.mockResolvedValue({ expiresAt: '2026-09-30T13:35:00Z' });
        await act(async () => { await result.current.verifyCode(); });
        expect(result.current.isVerified).toBe(false);
        act(() => { expect(result.current.getVerificationTicket()).toBeNull(); });
    });

    it('rejects a late verification response after the email changes', async () => {
        const { result } = show();
        await act(async () => { await result.current.sendCode(); });
        let finish;
        api.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        let pending;
        act(() => { pending = result.current.verifyCode(); });
        form.getFieldValue.mockImplementation(name => name === 'email' ? 'changed@example.com' : '123456');
        await act(async () => {
            finish({ expiresAt: '2026-09-30T13:35:00Z', verificationTicket: 'a'.repeat(43) });
            await pending;
        });
        expect(result.current.isVerified).toBe(false);
        act(() => { expect(result.current.getVerificationTicket()).toBeNull(); });
    });

    it('checks expiry at submission even before a delayed timer or visibility event runs', async () => {
        const { result } = show();
        await act(async () => { await result.current.sendCode(); await result.current.verifyCode(); });
        vi.setSystemTime(new Date('2026-09-30T13:35:00Z'));
        act(() => { expect(result.current.getVerificationTicket()).toBeNull(); });
        expect(result.current.isVerified).toBe(false);
    });

    it.each(['send', 'verify'])('ignores a late %s response after leaving the signup screen', async action => {
        const onVerified = vi.fn();
        const { result, unmount } = show({ onVerified });
        if (action === 'verify') await act(async () => { await result.current.sendCode(); });
        let finish;
        api.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        let pending;
        await act(async () => { pending = result.current[action === 'send' ? 'sendCode' : 'verifyCode'](); });
        unmount();
        const intervalsBeforeResponse = setInterval.mock.calls.length;
        const feedbackBeforeResponse = feedback.message.success.mock.calls.length;
        const storageBeforeResponse = localStorage.getItem(storageKey);
        await act(async () => {
            finish({ expiresAt: '2026-09-30T13:35:00Z', verificationTicket: 'a'.repeat(43) });
            await pending;
        });
        expect(setInterval).toHaveBeenCalledTimes(intervalsBeforeResponse);
        expect(feedback.message.success).toHaveBeenCalledTimes(feedbackBeforeResponse);
        expect(localStorage.getItem(storageKey)).toBe(storageBeforeResponse);
        expect(onVerified).not.toHaveBeenCalled();
    });
});
