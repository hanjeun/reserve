import { beforeEach, describe, expect, it, vi } from 'vitest';

const MAIN = 'https://cdn.reserve.it.kr/users/3/stores/41/thumbnails/main.webp';
const FIRST = 'https://cdn.reserve.it.kr/users/3/stores/41/images/first.webp';
const SECOND = 'https://cdn.reserve.it.kr/users/3/stores/41/images/second.webp';
const STORE = { id: 41, mainImageUrl: MAIN, mainImageWidth: 960, mainImageHeight: 640 };
let cache;
const documentHint = (url = FIRST, extra = {}) => {
    const values = { id: 41, url, width: 600, height: 800, ...extra };
    for (const [key, value] of Object.entries(values)) {
        const meta = document.createElement('meta');
        meta.name = `reserve-store-image-${key}`;
        meta.content = String(value);
        document.head.append(meta);
    }
};

describe('public store photo hints', () => {
    beforeEach(async () => {
        vi.resetModules();
        sessionStorage.clear();
        document.querySelectorAll('meta[name^="reserve-store-image-"]').forEach(meta => meta.remove());
        cache = await import('./imageHintCache');
    });

    it('stores only the public photo identity and dimensions', () => {
        cache.rememberImageHints({ ...STORE, ownerId: 17, phone: 'private fixture', addressDetail: 'private fixture' });
        expect(cache.getImageHint(41)).toEqual({ width: 960, height: 640 });
        expect(JSON.parse(sessionStorage.getItem('reserve:storeImageHints'))).toEqual({ 41: { url: MAIN, width: 960, height: 640 } });
    });

    it('uses the first detail photo and follows a reordered URL list instead of the thumbnail', () => {
        const store = { ...STORE, detailImageUrls: [FIRST, SECOND], detailImageMeta: [
            { url: FIRST, width: 600, height: 800 }, { url: SECOND, width: 1200, height: 500 },
        ] };
        cache.rememberImageHints(store);
        expect(cache.getImageHint(41)).toEqual({ width: 600, height: 800, layoutRatio: 0.75 });
        cache.rememberImageHints({ ...store, detailImageUrls: [SECOND, FIRST] });
        expect(cache.getImageHint(41)).toEqual({ width: 1200, height: 500, layoutRatio: 0.75 });
        expect(JSON.parse(sessionStorage.getItem('reserve:storeImageHints'))[41].url).toBe(SECOND);
    });

    it('invalidates the previous photo when a replacement has missing or mismatched metadata', () => {
        cache.rememberImageHints(STORE);
        cache.rememberImageHints({ ...STORE, detailImageUrls: [FIRST], detailImageMeta: [{ url: SECOND, width: 600, height: 800 }] });
        expect(cache.getImageHint(41)).toBeNull();
        expect(JSON.parse(sessionStorage.getItem('reserve:storeImageHints'))).toEqual({});
        expect(cache.extractImageHint({ ...STORE, detailImageUrls: [FIRST] })).toBeNull();
    });

    it('drops an obsolete track ratio if any current slide loses its measurement', () => {
        const store = { ...STORE, detailImageUrls: [FIRST, SECOND], detailImageMeta: [
            { url: FIRST, width: 1200, height: 500 }, { url: SECOND, width: 600, height: 800 },
        ] };
        cache.rememberImageHints(store);
        expect(cache.getImageHint(41)).toEqual({ width: 1200, height: 500, layoutRatio: 0.75 });
        cache.rememberImageHints({ ...store, detailImageMeta: [store.detailImageMeta[0]] });
        expect(cache.getImageHint(41)).toEqual({ width: 1200, height: 500 });
        expect(JSON.parse(sessionStorage.getItem('reserve:storeImageHints'))[41]).not.toHaveProperty('layoutRatio');
    });

    it('rejects invalid dimensions and old entries that cannot identify a photo', () => {
        sessionStorage.setItem('reserve:storeImageHints', JSON.stringify({ 41: { width: 960, height: 640 } }));
        expect(cache.getImageHint(41)).toBeNull();
        for (const width of [0, -1, Infinity, NaN, '960']) {
            cache.rememberImageHints({ ...STORE, mainImageWidth: width });
            expect(cache.getImageHint(41)).toBeNull();
        }
    });

    it('prefers the exact document hint until newer public data supersedes it, including removal', () => {
        sessionStorage.setItem('reserve:storeImageHints', JSON.stringify({ 41: { url: MAIN, width: 960, height: 640 } }));
        documentHint();
        expect(cache.getImageHint(41)).toEqual({ width: 600, height: 800 });
        expect(cache.getImageHint(42)).toBeNull();
        cache.rememberImageHints(STORE);
        expect(cache.getImageHint(41)).toEqual({ width: 960, height: 640 });
        cache.forgetImageHint(41);
        expect(cache.getImageHint(41)).toBeNull();
    });

    it('does not use private, signed, cross-store or spoofed document URLs', () => {
        for (const url of [
            'https://cdn.reserve.it.kr/users/3/chat/1/private.bin',
            FIRST + '?signature=private', FIRST + '#fragment',
            'https://cdn.reserve.it.kr.evil.example/users/3/stores/41/images/photo.webp',
            'https://cdn.reserve.it.kr/users/3/stores/42/images/photo.webp',
            'https://someone@cdn.reserve.it.kr/users/3/stores/41/images/photo.webp',
            'javascript:alert(1)',
        ]) {
            documentHint(url);
            expect(cache.getImageHint(41)).toBeNull();
            document.querySelectorAll('meta[name^="reserve-store-image-"]').forEach(meta => meta.remove());
        }
    });
});
