import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestChatImageBlob } from './chatImageRequests';
import { clearChatImageCache, invalidateChatImages } from './chatImageCache';
import { advanceSession } from '../api/sessionScope';
import { assertChatImageAccess, getChatImageBlob } from './chatImageTransfer';

vi.mock('./chatImageTransfer', () => ({ getChatImageBlob: vi.fn(), assertChatImageAccess: vi.fn() }));

let controllers;
let requests;
let finishes;
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const request = (id, current = () => true) => {
    const controller = new AbortController();
    controllers.push(controller);
    const pending = requestChatImageBlob(`/api/chat/images/${id}`, controller.signal, current);
    pending.catch(() => {});
    requests.push(pending);
    return pending;
};
beforeEach(() => {
    clearChatImageCache();
    assertChatImageAccess.mockReset().mockResolvedValue(undefined);
    controllers = []; requests = []; finishes = [];
    getChatImageBlob.mockReset().mockImplementation((url, signal) => new Promise((resolve, reject) => {
        finishes.push(resolve);
        signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
    }));
});
afterEach(async () => {
    controllers.forEach(controller => controller.abort());
    await Promise.allSettled(requests);
    await flush();
    clearChatImageCache();
});

it('bounds reads at two and pending work at 32, removing aborted queued work immediately', async () => {
    for (let id = 1; id <= 34; id += 1) request(id);
    await flush();
    expect(getChatImageBlob).toHaveBeenCalledTimes(2);
    await expect(request(35)).rejects.toMatchObject({ status: 429 });
    controllers[2].abort();
    await expect(requests[2]).rejects.toMatchObject({ name: 'AbortError' });
    request(36); // 취소된 대기 항목은 이미 동시 처리 자리를 반환했다.
    finishes[0](new Blob(['png'], { type: 'image/png' }));
    await flush();
    expect(getChatImageBlob).toHaveBeenCalledTimes(3);
    expect(getChatImageBlob.mock.calls[2][0]).toBe('/api/chat/images/4');
});

it('drops stale queued work before reading and rejects late active success after its account changes', async () => {
    let current = true;
    request(1, () => current);
    request(2, () => current);
    request(3, () => current);
    await flush();
    current = false;
    finishes.forEach(finish => finish(new Blob(['png'], { type: 'image/png' })));
    await expect(Promise.all(requests)).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(getChatImageBlob).toHaveBeenCalledTimes(2);
    expect((await Promise.allSettled(requests)).every(result => result.status === 'rejected')).toBe(true);
});

it('shares a participant read until its last reader leaves', async () => {
    const first = request(91); const second = request(91);
    await flush();
    expect(getChatImageBlob).toHaveBeenCalledTimes(1);
    const signal = getChatImageBlob.mock.calls[0][1];
    controllers[0].abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal.aborted).toBe(false);
    finishes[0](new Blob(['shared'], { type: 'image/png' }));
    expect(await second).toBeInstanceOf(Blob);
});

it('revalidates a cached image without downloading it and rejects revoked access', async () => {
    const first = request(92); await flush();
    const blob = new Blob(['private'], { type: 'image/png' });
    finishes[0](blob); expect(await first).toBe(blob); await flush();
    expect(await request(92)).toBe(blob);
    expect(assertChatImageAccess).toHaveBeenCalledTimes(1);
    expect(getChatImageBlob).toHaveBeenCalledTimes(1);
    await flush();
    invalidateChatImages([777]);
    expect(await request(92)).toBe(blob);
    expect(getChatImageBlob).toHaveBeenCalledTimes(1);
    await flush();
    assertChatImageAccess.mockRejectedValueOnce(Object.assign(new Error('hidden'), { status: 404 }));
    await expect(request(92)).rejects.toMatchObject({ status: 404 });
    expect(getChatImageBlob).toHaveBeenCalledTimes(1);
});

it('never shares or browser-caches report evidence reads', async () => {
    const evidence = () => {
        const controller = new AbortController(); controllers.push(controller);
        const pending = requestChatImageBlob('/api/admin/chat/reports/1/images/93', controller.signal, () => true);
        pending.catch(() => {}); requests.push(pending); return pending;
    };
    const first = evidence(), second = evidence(); await flush();
    expect(getChatImageBlob).toHaveBeenCalledTimes(2);
    finishes.forEach(finish => finish(new Blob(['evidence'], { type: 'image/png' })));
    await Promise.all([first, second]); await flush();
    const third = evidence(); await flush();
    expect(getChatImageBlob).toHaveBeenCalledTimes(3);
    expect(assertChatImageAccess).not.toHaveBeenCalled();
    finishes[2](new Blob(['evidence'], { type: 'image/png' })); await third;
});

it('aborts active and queued reads on account change and discards the previous cache', async () => {
    const cached = request(94); await flush();
    finishes[0](new Blob(['old account'], { type: 'image/png' })); await cached; await flush();
    const first = request(95), second = request(96), queued = request(97); await flush();
    advanceSession();
    const settled = await Promise.allSettled([first, second, queued]);
    expect(settled.every(result => result.status === 'rejected')).toBe(true);
    await flush();
    const fresh = request(94); await flush();
    expect(assertChatImageAccess).not.toHaveBeenCalled();
    expect(getChatImageBlob.mock.calls.at(-1)[0]).toBe('/api/chat/images/94');
    finishes.at(-1)(new Blob(['new account'], { type: 'image/png' })); await fresh;
});

it('rejects a photo response that arrives after its deletion is known', async () => {
    const first = request(98); await flush();
    invalidateChatImages([98]);
    finishes[0](new Blob(['withdrawn'], { type: 'image/png' }));
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    const retry = request(98); await flush();
    expect(getChatImageBlob).toHaveBeenCalledTimes(2);
    expect(assertChatImageAccess).not.toHaveBeenCalled();
    finishes[1](new Blob(['authorized response'], { type: 'image/png' })); await retry;
});
