import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useChatThread from '../useChatThread';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('chat response ownership', () => {
    for (const outcome of ['success', 'failure']) {
        it(`ignores old room ${outcome} after A to B to A without restoring a draft`, async () => {
            const pending = deferred();
            const onSent = vi.fn(), onError = vi.fn();
            const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [] });
            const poll = vi.fn().mockResolvedValue([]);
            const send = vi.fn().mockReturnValue(pending.promise);
            const hook = renderHook(({ key }) => useChatThread({
                threadKey: key, myRole: 'ADMIN', load, poll, send, onSent, onError,
            }), { initialProps: { key: 'A' } });
            await waitFor(() => expect(hook.result.current.roomId).toBe(1));
            let result;
            act(() => { result = hook.result.current.send('old draft'); });
            expect(hook.result.current.sending).toBe(true);
            hook.rerender({ key: 'B' });
            await waitFor(() => expect(hook.result.current.roomId).toBe(1));
            hook.rerender({ key: 'A' });
            await waitFor(() => expect(hook.result.current.roomId).toBe(1));
            await act(async () => {
                if (outcome === 'success') pending.resolve({ id: 10, content: 'old draft' });
                else pending.reject(new Error('late failure'));
                expect(await result).toBeNull();
            });
            expect(hook.result.current.messages).toEqual([]);
            expect(hook.result.current.sending).toBe(false);
            expect(onSent).not.toHaveBeenCalled();
            expect(onError).not.toHaveBeenCalled();
        });
    }
    it('blocks duplicate sends in the same tick and understands normalized 429', async () => {
        const pending = deferred();
        const onError = vi.fn();
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [] });
        const poll = vi.fn().mockResolvedValue([]);
        const send = vi.fn().mockReturnValue(pending.promise);
        const hook = renderHook(() => useChatThread({ threadKey: 'A', myRole: 'ADMIN', load, poll, send, onError }));
        await waitFor(() => expect(hook.result.current.roomId).toBe(1));
        let first, second;
        act(() => { first = hook.result.current.send('first'); second = hook.result.current.send('second'); });
        expect(await second).toBe(false);
        await act(async () => { pending.reject({ status: 429 }); expect(await first).toBe(false); });
        expect(send).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith('조금 천천히 보내주세요.');
    });
});
