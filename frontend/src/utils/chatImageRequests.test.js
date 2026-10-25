import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestChatImageBlob } from './chatImageRequests';
import { getChatImageBlob } from './chatImageTransfer';

vi.mock('./chatImageTransfer', () => ({ getChatImageBlob: vi.fn() }));

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
