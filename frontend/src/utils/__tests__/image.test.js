import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

const loadImages = async base => {
    vi.stubEnv('VITE_API_BASE_URL', base);
    vi.resetModules();
    return import('../image');
};

describe('image API origin', () => {
    it.each([undefined, ''])('keeps same-origin media paths when the API base is %j', async base => {
        const images = await loadImages(base);
        for (const render of [images.getThumbnailUrl, images.getDetailImageUrl, images.getProfileImageUrl]) {
            expect(render('/api/feed/media/1')).toBe('/api/feed/media/1');
        }
    });

    it('keeps an explicitly configured API origin for uploaded media', async () => {
        const { getThumbnailUrl } = await loadImages('https://api.example.test');
        expect(getThumbnailUrl('/uploads/store.webp')).toBe('https://api.example.test/uploads/store.webp');
    });

    it('preserves absolute image URLs independently of the API origin', async () => {
        const { getThumbnailUrl } = await loadImages(undefined);
        expect(getThumbnailUrl('https://cdn.example.test/store.webp')).toBe('https://cdn.example.test/store.webp');
    });

    it('keeps the existing empty-image fallbacks', async () => {
        const { getThumbnailUrl, getDetailImageUrl, getProfileImageUrl } = await loadImages(undefined);
        expect(getThumbnailUrl(null)).toBe('https://placehold.co/300x200?text=No+Image');
        expect(getDetailImageUrl('')).toBe('https://placehold.co/800x450?text=No+Image');
        expect(getProfileImageUrl(undefined)).toBe('https://placehold.co/80x80?text=User');
    });
});
