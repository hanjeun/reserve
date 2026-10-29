import { afterEach, expect, it, vi } from 'vitest';
import { advanceSession } from '../api/sessionScope';
import { cachedChatImage, chatImageCacheScope, clearChatImageCache, invalidateChatImages, rememberChatImage } from './chatImageCache';

afterEach(() => { clearChatImageCache(); vi.useRealTimers(); });
it('evicts by byte budget and keeps recently reused images', () => {
    const scope = chatImageCacheScope();
    const large = new Blob([new Uint8Array(8 * 1024 * 1024)], { type: 'image/png' });
    rememberChatImage('first', large, scope); rememberChatImage('second', large, scope);
    expect(cachedChatImage('first')).toBe(large);
    rememberChatImage('third', new Blob(['new']), scope);
    expect(cachedChatImage('second')).toBeUndefined();
    expect(cachedChatImage('first')).toBe(large);
    expect(cachedChatImage('third')).toBeInstanceOf(Blob);
});
it('bounds entry count and expires plaintext after two minutes', () => {
    vi.useFakeTimers();
    const scope = chatImageCacheScope();
    for (let id = 0; id < 25; id += 1) rememberChatImage(String(id), new Blob(['x']), scope);
    expect(cachedChatImage('0')).toBeUndefined();
    expect(cachedChatImage('24')).toBeInstanceOf(Blob);
    vi.advanceTimersByTime(120_000);
    expect(cachedChatImage('24')).toBeUndefined();
});
it('clears immediately on account change or deletion and cannot be repopulated by an old read', () => {
    let scope = chatImageCacheScope();
    rememberChatImage('image', new Blob(['private']), scope);
    advanceSession();
    expect(cachedChatImage('image')).toBeUndefined();
    rememberChatImage('late account response', new Blob(['old']), scope);
    expect(cachedChatImage('late account response')).toBeUndefined();
    scope = chatImageCacheScope();
    clearChatImageCache();
    rememberChatImage('late deleted response', new Blob(['old']), scope);
    expect(cachedChatImage('late deleted response')).toBeUndefined();
});

it('invalidates only changed photos and refuses their late responses', () => {
    const first = chatImageCacheScope('/api/chat/images/11');
    const second = chatImageCacheScope('/api/chat/images/12');
    const blob = new Blob(['private']);
    rememberChatImage('first', blob, first); rememberChatImage('second', blob, second);
    invalidateChatImages([11, 500]);
    expect(cachedChatImage('first')).toBeUndefined();
    expect(cachedChatImage('second')).toBe(blob);
    rememberChatImage('late deleted image', blob, first);
    expect(cachedChatImage('late deleted image')).toBeUndefined();
    invalidateChatImages(Array.from({ length: 129 }, (_, index) => index + 1));
    rememberChatImage('late overflow image', blob, second);
    expect(cachedChatImage('late overflow image')).toBeUndefined();
});

it('does not let unrelated historical deletion batches evict current photos', () => {
    const scope = chatImageCacheScope('/api/chat/images/1000');
    const blob = new Blob(['current']); rememberChatImage('current', blob, scope);
    invalidateChatImages(Array.from({ length: 200 }, (_, index) => index + 1));
    expect(cachedChatImage('current')).toBe(blob);
    expect(chatImageCacheScope('/api/chat/images/1000').version).toBe(scope.version);
});
