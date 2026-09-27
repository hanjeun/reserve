import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useChatThread from '../useChatThread';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('chat response ownership', () => {
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

describe('chat initial-load and same-room retry boundaries', () => {
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
        expect(onError).toHaveBeenCalledExactlyOnceWith('대화를 불러오지 못했습니다.');
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
});
