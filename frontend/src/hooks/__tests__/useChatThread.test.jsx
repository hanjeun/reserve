import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useChatThread from '../useChatThread';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('chat response ownership', () => {
    it('interrupts the pending request and keeps the same retry identity for an ambiguous delivery', async () => {
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [] });
        const poll = vi.fn().mockResolvedValue([]);
        const onError = vi.fn();
        const send = vi.fn().mockImplementationOnce((_room, _text, _id, _file, { signal }) =>
            new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })))
            .mockResolvedValueOnce({ id: 33, content: '사진', senderRole: 'MEMBER' });
        const file = new File(['photo'], 'photo.png', { type: 'image/png' });
        const hook = renderHook(() => useChatThread({ threadKey: 'A', myRole: 'MEMBER', load, poll, send, onError, cancellable: true }));
        await waitFor(() => expect(hook.result.current.roomId).toBe(1));
        let request;
        act(() => { request = hook.result.current.send('사진', file); });
        expect(hook.result.current.sending).toBe(true);
        await act(async () => { hook.result.current.cancelSend(); expect(await request).toBe(false); });
        expect(send.mock.calls[0][4].signal.aborted).toBe(true);
        expect(hook.result.current.messages).toEqual([]);
        expect(hook.result.current.sending).toBe(false);
        expect(onError).toHaveBeenCalledWith(expect.stringContaining('서버에 도착했을 수'));
        await act(async () => { expect(await hook.result.current.send('사진', file)).toBe(true); });
        expect(send.mock.calls[1][2]).toBe(send.mock.calls[0][2]);
    });

    it('updates old message ids through a separate cursor without appending unseen history or issuing new-message notifications', async () => {
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [{ id: 2, content: '원문' }, { id: 99, content: '최신' }] });
        const poll = vi.fn().mockResolvedValue([]);
        const pollChanges = vi.fn().mockResolvedValueOnce({ messages: [
            { id: 1, retracted: true, content: '취소' }, { id: 2, retracted: true, content: '취소', imageUrl: null },
        ], nextRevision: 9 }).mockResolvedValue({ messages: [], nextRevision: 9 });
        const onPolled = vi.fn(), onChanged = vi.fn();
        const hook = renderHook(() => useChatThread({ threadKey: 'A', myRole: 'MEMBER', load, poll, send: vi.fn(), pollChanges, onPolled, onChanged, pollMs: 60000 }));
        await waitFor(() => expect(hook.result.current.messages[0].retracted).toBe(true));
        expect(hook.result.current.messages.map(message => message.id)).toEqual([2, 99]);
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        await waitFor(() => expect(pollChanges).toHaveBeenLastCalledWith(1, 9));
        expect(poll).toHaveBeenLastCalledWith(1, 99);
        expect(onPolled).not.toHaveBeenCalled();
        expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('does not apply a stale retraction to a newly opened room', async () => {
        const delayed = deferred();
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [{ id: 2, content: '원문' }] });
        const poll = vi.fn().mockResolvedValue([]);
        const pollChanges = vi.fn().mockReturnValueOnce(delayed.promise).mockResolvedValue({ messages: [], nextRevision: 0 });
        const onChanged = vi.fn();
        const hook = renderHook(({ key }) => useChatThread({ threadKey: key, myRole: 'MEMBER', load, poll, send: vi.fn(), pollChanges, onChanged }), { initialProps: { key: 'A' } });
        await waitFor(() => expect(pollChanges).toHaveBeenCalledTimes(1));
        hook.rerender({ key: 'B' });
        await waitFor(() => expect(pollChanges).toHaveBeenCalledTimes(2));
        await act(async () => { delayed.resolve({ messages: [{ id: 2, retracted: true }], nextRevision: 1 }); });
        expect(hook.result.current.messages).toEqual([{ id: 2, content: '원문' }]);
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('sends photo-only messages and reuses their retry id without double insertion', async () => {
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [] });
        const poll = vi.fn().mockResolvedValue([]);
        const send = vi.fn().mockRejectedValueOnce(new Error('response lost'))
            .mockResolvedValueOnce({ id: 33, content: '', imageUrl: '/api/chat/images/33' });
        const file = new File(['photo'], 'photo.png', { type: 'image/png' });
        const hook = renderHook(() => useChatThread({ threadKey: 'A', myRole: 'MEMBER', load, poll, send }));
        await waitFor(() => expect(hook.result.current.roomId).toBe(1));
        await act(async () => { expect(await hook.result.current.send('', file)).toBe(false); });
        await act(async () => { expect(await hook.result.current.send('', file)).toBe(true); });
        expect(send.mock.calls[0]).toEqual([1, '', expect.any(String), file]);
        expect(send.mock.calls[1][2]).toBe(send.mock.calls[0][2]);
        expect(hook.result.current.messages).toEqual([{ id: 33, content: '', imageUrl: '/api/chat/images/33' }]);
    });
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

    it('reuses the client message id when an ambiguous failure is retried', async () => {
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [] });
        const poll = vi.fn().mockResolvedValue([]);
        const send = vi.fn()
            .mockRejectedValueOnce(new Error('response lost'))
            .mockResolvedValueOnce({ id: 12, content: '같은 내용', senderRole: 'MEMBER' });
        const hook = renderHook(() => useChatThread({
            threadKey: 'A', myRole: 'MEMBER', load, poll, send,
        }));
        await waitFor(() => expect(hook.result.current.roomId).toBe(1));

        await act(async () => { expect(await hook.result.current.send('같은 내용')).toBe(false); });
        await act(async () => { expect(await hook.result.current.send('같은 내용')).toBe(true); });

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[0][2]).toBeTruthy();
        expect(send.mock.calls[1][2]).toBe(send.mock.calls[0][2]);
    });
});

describe('chat retraction delta boundaries', () => {
    it('orders retractions after new messages and keeps their cursor across callback changes and failed batches', async () => {
        const firstMessages = deferred();
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [{ id: 50 }] });
        const poll = vi.fn().mockReturnValueOnce(firstMessages.promise).mockResolvedValue([]);
        const pollChanges = vi.fn().mockResolvedValueOnce({
            messages: [{ id: 51, retracted: true, content: '취소', imageUrl: null }], nextRevision: 100, hasMore: true,
        }).mockRejectedValueOnce(new Error('retry retractions'))
            .mockResolvedValue({ messages: [], nextRevision: 101, hasMore: false });
        const onChanged = vi.fn();
        const hook = renderHook(({ changed }) => useChatThread({
            threadKey: 'A', myRole: 'MEMBER', load, poll, send: vi.fn(), pollChanges, onChanged: changed, pollMs: 60000,
        }), { initialProps: { changed: onChanged } });
        await waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
        expect(pollChanges).not.toHaveBeenCalled();
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(poll).toHaveBeenCalledTimes(1);
        await act(async () => { firstMessages.resolve([{ id: 51, content: '원문', imageUrl: '/image/51' }]); });
        await waitFor(() => expect(hook.result.current.messages[1].retracted).toBe(true));
        expect(pollChanges).toHaveBeenCalledWith(1, 0);
        expect(hook.result.current.messages[1]).toMatchObject({ content: '취소', imageUrl: null });

        const replacement = vi.fn();
        hook.rerender({ changed: replacement });
        await waitFor(() => expect(pollChanges).toHaveBeenCalledTimes(2));
        expect(pollChanges).toHaveBeenLastCalledWith(1, 100);
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(pollChanges).toHaveBeenLastCalledWith(1, 100);
        expect(poll).toHaveBeenLastCalledWith(1, 51);
        poll.mockRejectedValueOnce(new Error('message polling failed'));
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(pollChanges).toHaveBeenLastCalledWith(1, 101);
        expect(onChanged).toHaveBeenCalledTimes(1);
        expect(replacement).not.toHaveBeenCalled();
    });

    it.each(['hidden', 'superseded'])('does not start a retraction request from a %s message polling cycle', async boundary => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        const oldMessages = deferred(), currentMessages = deferred();
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [{ id: 1 }] });
        const poll = vi.fn().mockReturnValueOnce(oldMessages.promise);
        const pollChanges = vi.fn().mockResolvedValue({ messages: [], nextRevision: 0 });
        const changed = vi.fn();
        const hook = renderHook(({ callback }) => useChatThread({
            threadKey: 'A', myRole: 'MEMBER', load, poll, pollChanges, send: vi.fn(), onChanged: callback, pollMs: 60000,
        }), { initialProps: { callback: changed } });
        try {
            await waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
            if (boundary === 'hidden') {
                visibility.mockReturnValue('hidden');
                poll.mockResolvedValue([]);
            } else {
                poll.mockReturnValueOnce(currentMessages.promise);
                hook.rerender({ callback: vi.fn() });
                await waitFor(() => expect(poll).toHaveBeenCalledTimes(2));
            }
            await act(async () => { oldMessages.resolve([{ id: 99, content: '이전 조회' }]); });
            expect(pollChanges).not.toHaveBeenCalled();
            if (boundary === 'hidden') {
                visibility.mockReturnValue('visible');
                await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
                expect(poll).toHaveBeenLastCalledWith(1, 99);
            } else {
                expect(hook.result.current.messages).toEqual([{ id: 1 }]);
                await act(async () => { currentMessages.resolve([{ id: 2 }]); });
                expect(hook.result.current.messages).toEqual([{ id: 1 }, { id: 2 }]);
            }
            await waitFor(() => expect(pollChanges).toHaveBeenCalledExactlyOnceWith(1, 0));
        } finally {
            hook.unmount();
            visibility.mockRestore();
        }
    });

    it('retries a superseded pending retraction without applying its response or advancing the cursor', async () => {
        const previousChanges = deferred();
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [{ id: 2, content: '원문' }] });
        const poll = vi.fn().mockResolvedValue([]);
        const pollChanges = vi.fn().mockReturnValueOnce(previousChanges.promise).mockResolvedValue({
            messages: [{ id: 2, retracted: true, content: '취소' }], nextRevision: 7,
        });
        const firstChanged = vi.fn(), currentChanged = vi.fn();
        const hook = renderHook(({ changed }) => useChatThread({
            threadKey: 'A', myRole: 'MEMBER', load, poll, pollChanges, send: vi.fn(), onChanged: changed, pollMs: 60000,
        }), { initialProps: { changed: firstChanged } });
        await waitFor(() => expect(pollChanges).toHaveBeenCalledTimes(1));
        hook.rerender({ changed: currentChanged });
        await waitFor(() => expect(poll).toHaveBeenCalledTimes(2));
        await act(async () => { previousChanges.resolve({ messages: [{ id: 2, retracted: true }], nextRevision: 7 }); });
        expect(hook.result.current.messages).toEqual([{ id: 2, content: '원문' }]);
        expect(firstChanged).not.toHaveBeenCalled();
        expect(pollChanges).toHaveBeenCalledTimes(1);
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(pollChanges).toHaveBeenLastCalledWith(1, 0);
        expect(hook.result.current.messages[0]).toMatchObject({ retracted: true, content: '취소' });
        expect(currentChanged).toHaveBeenCalledTimes(1);
    });

    it('rejects delayed history after a retraction or same-room reload and accepts a fresh retry without caching unseen ids', async () => {
        const firstMessages = deferred();
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [{ id: 20 }] });
        const poll = vi.fn().mockReturnValueOnce(firstMessages.promise).mockResolvedValue([]);
        const pollChanges = vi.fn().mockResolvedValue({
            messages: [{ id: 2, retracted: true, content: '취소', imageUrl: null }], nextRevision: 7,
        });
        const onChanged = vi.fn();
        const hook = renderHook(() => useChatThread({
            threadKey: 'A', myRole: 'MEMBER', load, poll, pollChanges, send: vi.fn(), onChanged, pollMs: 60000,
        }));
        await waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
        const previousHistory = hook.result.current.captureHistory();
        await act(async () => { firstMessages.resolve([]); });
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(hook.result.current.messages).toEqual([{ id: 20 }]);
        act(() => expect(hook.result.current.prepend([{ id: 2, content: '원문', imageUrl: '/image/2' }], previousHistory)).toBe(false));
        expect(hook.result.current.messages).toEqual([{ id: 20 }]);
        const currentHistory = hook.result.current.captureHistory();
        act(() => expect(hook.result.current.prepend([{ id: 2, retracted: true, content: '취소', imageUrl: null }], currentHistory)).toBe(true));
        expect(hook.result.current.messages).toEqual([{ id: 2, retracted: true, content: '취소', imageUrl: null }, { id: 20 }]);
        act(() => expect(hook.result.current.prepend([{ id: 1 }])).toBe(true));
        expect(hook.result.current.messages[0]).toEqual({ id: 1 });

        act(() => hook.result.current.reload());
        expect(hook.result.current.captureHistory()).toBeNull();
        act(() => expect(hook.result.current.prepend([{ id: 3 }], currentHistory)).toBe(false));
        await waitFor(() => expect(hook.result.current.loading).toBe(false));
        act(() => expect(hook.result.current.prepend([{ id: 3 }], currentHistory)).toBe(false));
        expect(hook.result.current.messages).toEqual([{ id: 20 }]);
    });
});

describe('chat pending read notifications', () => {
    it('replays a deferred final empty batch after async rejection and hidden focus without notifying every empty poll', async () => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [] });
        const batch = Array.from({ length: 50 }, (_, index) => ({ id: index + 1 }));
        const poll = vi.fn().mockResolvedValueOnce(batch).mockResolvedValue([]);
        let readAcknowledgement = deferred();
        const onPolled = vi.fn(async (_room, _fresh, { caughtUp }) => {
            if (!caughtUp || !document.hasFocus()) return false;
            return readAcknowledgement.promise;
        });
        const hook = renderHook(() => useChatThread({
            threadKey: 'A', myRole: 'MEMBER', load, poll, send: vi.fn(), onPolled, pollMs: 60000,
        }));
        try {
            await waitFor(() => expect(onPolled).toHaveBeenCalledWith(1, batch, { caughtUp: false, readThroughId: 50 }));
            focus.mockReturnValue(false);
            await act(async () => { window.dispatchEvent(new Event('focus')); });
            expect(onPolled).toHaveBeenLastCalledWith(1, [], { caughtUp: true, readThroughId: 50 });
            expect(onPolled).toHaveBeenCalledTimes(2);
            poll.mockRejectedValueOnce(new Error('retry polling before acknowledging'));
            await act(async () => { window.dispatchEvent(new Event('focus')); });
            expect(onPolled).toHaveBeenCalledTimes(2);
            visibility.mockReturnValue('hidden');
            focus.mockReturnValue(true);
            await act(async () => { window.dispatchEvent(new Event('focus')); });
            expect(poll).toHaveBeenCalledTimes(3);
            visibility.mockReturnValue('visible');
            await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
            expect(poll).toHaveBeenLastCalledWith(1, 50);
            expect(onPolled).toHaveBeenLastCalledWith(1, [], { caughtUp: true, readThroughId: 50 });
            expect(onPolled).toHaveBeenCalledTimes(3);
            await act(async () => { window.dispatchEvent(new Event('focus')); });
            expect(poll).toHaveBeenCalledTimes(4);
            await act(async () => { readAcknowledgement.reject(new Error('read acknowledgement failed')); });
            readAcknowledgement = deferred();
            await act(async () => { window.dispatchEvent(new Event('focus')); });
            expect(onPolled).toHaveBeenCalledTimes(4);
            expect(onPolled).toHaveBeenLastCalledWith(1, [], { caughtUp: true, readThroughId: 50 });
            await act(async () => { readAcknowledgement.resolve(true); });
            await act(async () => { window.dispatchEvent(new Event('focus')); });
            expect(onPolled).toHaveBeenCalledTimes(4);
        } finally {
            hook.unmount();
            focus.mockRestore();
            visibility.mockRestore();
        }
    });

    it('keeps deferred notifications across callback changes and clears them after acknowledgement or reload', async () => {
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [{ id: 1 }] });
        const poll = vi.fn().mockResolvedValueOnce([{ id: 2 }]).mockResolvedValue([]);
        const deferredDecision = deferred(), acknowledged = deferred();
        const original = vi.fn().mockReturnValue(deferredDecision.promise);
        const replacement = vi.fn().mockReturnValueOnce(acknowledged.promise).mockResolvedValue(false);
        const hook = renderHook(({ callback }) => useChatThread({
            threadKey: 'A', myRole: 'MEMBER', load, poll, send: vi.fn(), onPolled: callback, pollMs: 60000,
        }), { initialProps: { callback: original } });
        await waitFor(() => expect(original).toHaveBeenCalledWith(1, [{ id: 2 }], { caughtUp: true, readThroughId: 2 }));
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(poll).toHaveBeenCalledTimes(1);
        await act(async () => { deferredDecision.resolve(false); });
        hook.rerender({ callback: replacement });
        await waitFor(() => expect(replacement).toHaveBeenCalledWith(1, [], { caughtUp: true, readThroughId: 2 }));
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(poll).toHaveBeenCalledTimes(2);
        await act(async () => { acknowledged.resolve(true); });
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(replacement).toHaveBeenCalledTimes(1);
        poll.mockResolvedValueOnce([{ id: 3 }]);
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(replacement).toHaveBeenLastCalledWith(1, [{ id: 3 }], { caughtUp: true, readThroughId: 3 });
        expect(replacement).toHaveBeenCalledTimes(2);
        load.mockResolvedValueOnce({ roomId: 1, messages: [{ id: 20 }] });
        act(() => hook.result.current.reload());
        await waitFor(() => expect(hook.result.current.loading).toBe(false));
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(poll).toHaveBeenLastCalledWith(1, 20);
        expect(replacement).toHaveBeenCalledTimes(2);
    });
});

describe('chat initial-load and same-room retry boundaries', () => {
    it('keeps the polling cursor behind send responses until every bounded batch has been received', async () => {
        const firstBatch = deferred();
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [{ id: 50, content: '기존 내역' }] });
        const poll = vi.fn().mockReturnValueOnce(firstBatch.promise)
            .mockRejectedValueOnce(new Error('retry this batch'))
            .mockResolvedValueOnce([{ id: 101, content: '다음 배치' }])
            .mockResolvedValueOnce([{ id: 200, content: '내 답변' }]);
        const send = vi.fn().mockResolvedValue({ id: 200, content: '내 답변' });
        const onPolled = vi.fn();
        const hook = renderHook(() => useChatThread({ threadKey: 'support', myRole: 'MEMBER', load, poll, send, onPolled, pollMs: 60000 }));
        await waitFor(() => expect(poll).toHaveBeenCalledWith(1, 50));
        await act(async () => { expect(await hook.result.current.send('내 답변')).toBe(true); });
        await act(async () => { firstBatch.resolve(Array.from({ length: 50 }, (_, index) => ({ id: 51 + index }))); });
        expect(hook.result.current.messages.map(message => message.id)).toEqual([
            ...Array.from({ length: 51 }, (_, index) => 50 + index), 200,
        ]);
        expect(onPolled).toHaveBeenLastCalledWith(1, expect.any(Array), { caughtUp: false, readThroughId: 100 });

        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(poll).toHaveBeenLastCalledWith(1, 100);
        expect(onPolled).toHaveBeenCalledTimes(1);
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(poll).toHaveBeenLastCalledWith(1, 100);
        expect(hook.result.current.messages.at(-2).id).toBe(101);
        expect(onPolled).toHaveBeenLastCalledWith(1, [{ id: 101, content: '다음 배치' }], { caughtUp: true, readThroughId: 101 });
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(poll).toHaveBeenLastCalledWith(1, 101);
        expect(hook.result.current.messages.filter(message => message.id === 200)).toHaveLength(1);
    });

    it('completes reading through the empty batch after receiving exactly 50 new messages', async () => {
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [] });
        const batch = Array.from({ length: 50 }, (_, index) => ({ id: index + 1 }));
        const poll = vi.fn().mockResolvedValueOnce(batch).mockResolvedValue([]);
        const onPolled = vi.fn();
        const hook = renderHook(() => useChatThread({ threadKey: 'support', myRole: 'MEMBER', load, poll, send: vi.fn(), onPolled, pollMs: 60000 }));
        await waitFor(() => expect(onPolled).toHaveBeenCalledWith(1, batch, { caughtUp: false, readThroughId: 50 }));
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(poll).toHaveBeenLastCalledWith(1, 50);
        expect(onPolled).toHaveBeenLastCalledWith(1, [], { caughtUp: true, readThroughId: 50 });
        expect(hook.result.current.messages).toEqual(batch);
    });

    it('does not poll or send while the first load is pending or after that load fails', async () => {
        const initial = deferred();
        const load = vi.fn().mockReturnValue(initial.promise);
        const poll = vi.fn().mockResolvedValue([]);
        const send = vi.fn().mockResolvedValue({ id: 1 });
        const onLoaded = vi.fn();
        const onError = vi.fn();
        const hook = renderHook(() => useChatThread({ threadKey: 'support', myRole: 'MEMBER', load, poll, send, onLoaded, onError }));
        expect(hook.result.current.loading).toBe(true);
        await act(async () => { expect(await hook.result.current.send('첫 문의')).toBe(false); });
        await act(async () => { initial.reject(new Error('initial load failed')); });
        expect(hook.result.current.loading).toBe(false);
        expect(hook.result.current.loadError).toBe(true);
        expect(hook.result.current.roomId).toBeNull();
        expect(hook.result.current.messages).toEqual([]);
        await act(async () => { expect(await hook.result.current.send('첫 문의')).toBe(false); });
        expect(send).not.toHaveBeenCalled();
        expect(poll).not.toHaveBeenCalled();
        expect(onLoaded).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledExactlyOnceWith('대화를 불러오지 못했어요.');
    });

    it('pauses polling and sending during a same-room reload and keeps them paused after a failed reload', async () => {
        const reloaded = deferred();
        const load = vi.fn().mockResolvedValueOnce({ roomId: 1, messages: [{ id: 1, content: '기존 내역' }] }).mockReturnValueOnce(reloaded.promise);
        const poll = vi.fn().mockResolvedValue([]);
        const send = vi.fn().mockResolvedValue({ id: 10 });
        const onPolled = vi.fn();
        const hook = renderHook(() => useChatThread({ threadKey: 'support', myRole: 'MEMBER', load, poll, send, onPolled, pollMs: 60000 }));
        await waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
        act(() => hook.result.current.reload());
        expect(hook.result.current.loading).toBe(true);
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => { expect(await hook.result.current.send('재조회 중 입력')).toBe(false); });
        expect(poll).toHaveBeenCalledTimes(1);
        await act(async () => { reloaded.reject(new Error('reload failed')); });
        expect(hook.result.current.loadError).toBe(true);
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => { expect(await hook.result.current.send('재조회 실패 중 입력')).toBe(false); });
        expect(poll).toHaveBeenCalledTimes(1);
        expect(send).not.toHaveBeenCalled();
        expect(onPolled).not.toHaveBeenCalled();
    });

    it.each(['before', 'after'])('ignores an old polling response arriving %s the successful same-room reload without invoking the read callback', async timing => {
        const oldPoll = deferred();
        const reloaded = deferred();
        const load = vi.fn().mockResolvedValueOnce({ roomId: 1, messages: [{ id: 1, content: '이전 내역' }] }).mockReturnValueOnce(reloaded.promise);
        const poll = vi.fn().mockReturnValueOnce(oldPoll.promise).mockResolvedValue([]);
        const onPolled = vi.fn();
        const onLoaded = vi.fn();
        const hook = renderHook(() => useChatThread({ threadKey: 'support', myRole: 'MEMBER', load, poll, send: vi.fn(), onPolled, onLoaded, pollMs: 60000 }));
        await waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
        act(() => hook.result.current.reload());
        const finishOld = async () => { oldPoll.resolve([{ id: 99, content: '늦은 이전 폴링' }]); await oldPoll.promise; };
        if (timing === 'before') await act(finishOld);
        expect(onPolled).not.toHaveBeenCalled();
        await act(async () => { reloaded.resolve({ roomId: 1, messages: [{ id: 20, content: '새 조회 내역' }] }); });
        if (timing === 'after') await act(finishOld);
        expect(hook.result.current.messages).toEqual([{ id: 20, content: '새 조회 내역' }]);
        expect(onLoaded).toHaveBeenCalledTimes(2);
        expect(onPolled).not.toHaveBeenCalled();
        expect(poll).toHaveBeenLastCalledWith(1, 20);
    });

    it.each(['success', 'failure'])('ignores the superseded initial-load %s after an explicit same-room retry succeeds', async outcome => {
        const initial = deferred();
        const load = vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValueOnce({ roomId: 2, messages: [{ id: 20, content: '재조회 성공' }] });
        const poll = vi.fn().mockResolvedValue([]);
        const onLoaded = vi.fn();
        const onError = vi.fn();
        const hook = renderHook(() => useChatThread({ threadKey: 'support', myRole: 'MEMBER', load, poll, send: vi.fn(), onLoaded, onError, pollMs: 60000 }));
        act(() => hook.result.current.reload());
        await waitFor(() => expect(hook.result.current.roomId).toBe(2));
        await act(async () => {
            if (outcome === 'success') initial.resolve({ roomId: 1, messages: [{ id: 1, content: '늦은 최초 조회' }] });
            else initial.reject(new Error('late initial failure'));
        });
        expect(hook.result.current.messages).toEqual([{ id: 20, content: '재조회 성공' }]);
        expect(hook.result.current.loadError).toBe(false);
        expect(onLoaded).toHaveBeenCalledTimes(1);
        expect(onError).not.toHaveBeenCalled();
    });

    it.each(['success', 'failure'])('ignores a superseded send %s after a same-room reload without restoring an old draft', async outcome => {
        const pendingSend = deferred();
        const load = vi.fn().mockResolvedValueOnce({ roomId: 1, messages: [] }).mockResolvedValueOnce({ roomId: 1, messages: [{ id: 20, content: '새 조회 내역' }] });
        const poll = vi.fn().mockResolvedValue([]);
        const send = vi.fn().mockReturnValue(pendingSend.promise);
        const onSent = vi.fn();
        const onError = vi.fn();
        const hook = renderHook(() => useChatThread({ threadKey: 'support', myRole: 'MEMBER', load, poll, send, onSent, onError, pollMs: 60000 }));
        await waitFor(() => expect(hook.result.current.roomId).toBe(1));
        let result;
        act(() => { result = hook.result.current.send('이전 입력'); hook.result.current.reload(); });
        await waitFor(() => expect(hook.result.current.messages).toEqual([{ id: 20, content: '새 조회 내역' }]));
        await act(async () => {
            if (outcome === 'success') pendingSend.resolve({ id: 10, content: '이전 입력' });
            else pendingSend.reject(new Error('late send failure'));
            expect(await result).toBeNull();
        });
        expect(hook.result.current.messages).toEqual([{ id: 20, content: '새 조회 내역' }]);
        expect(hook.result.current.sending).toBe(false);
        expect(onSent).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it('keeps the retry message identity across a same-room reload after an ambiguous send failure', async () => {
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [] });
        const poll = vi.fn().mockResolvedValue([]);
        const send = vi.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ id: 12, content: '같은 문의', senderRole: 'MEMBER' });
        const hook = renderHook(() => useChatThread({ threadKey: 'support', myRole: 'MEMBER', load, poll, send, pollMs: 60000 }));
        await waitFor(() => expect(hook.result.current.roomId).toBe(1));
        await act(async () => { expect(await hook.result.current.send('같은 문의')).toBe(false); });
        act(() => hook.result.current.reload());
        await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(hook.result.current.loading).toBe(false));
        await act(async () => { expect(await hook.result.current.send('같은 문의')).toBe(true); });
        expect(send.mock.calls[1][2]).toBe(send.mock.calls[0][2]);
    });
    it('pauses both polling cursors while hidden and refreshes immediately when visible', async () => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        const load = vi.fn().mockResolvedValue({ roomId: 1, messages: [] });
        const poll = vi.fn().mockResolvedValue([]);
        const pollChanges = vi.fn().mockResolvedValue({ messages: [], nextRevision: 0 });
        vi.useFakeTimers();
        let hook;
        try {
            await act(async () => {
                hook = renderHook(() => useChatThread({ threadKey: 'A', myRole: 'MEMBER', load, poll, pollChanges, send: vi.fn() }));
            });
            expect(poll).toHaveBeenCalledTimes(1);
            expect(pollChanges).toHaveBeenCalledTimes(1);
            visibility.mockReturnValue('hidden');
            await act(async () => { await vi.advanceTimersByTimeAsync(12000); });
            expect(poll).toHaveBeenCalledTimes(1);
            expect(pollChanges).toHaveBeenCalledTimes(1);
            visibility.mockReturnValue('visible');
            await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
            expect(poll).toHaveBeenCalledTimes(2);
            expect(pollChanges).toHaveBeenCalledTimes(2);
        } finally {
            hook?.unmount();
            vi.useRealTimers();
            visibility.mockRestore();
        }
    });

});
