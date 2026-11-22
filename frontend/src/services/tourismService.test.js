import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../api/axios';
import tourismService from './tourismService';

vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }));

describe('tourismService', () => {
    beforeEach(() => {
        api.get.mockReset();
        window.localStorage.clear();
    });
    afterEach(() => vi.restoreAllMocks());

    it('keeps the browser on the same-origin proxy path for region images', async () => {
        api.get.mockResolvedValue([{
            region: '부산',
            imageUrl: '/api/tourism/region-photos/부산/image',
            workTitle: '부산 대표 관광 사진',
        }]);

        await expect(tourismService.getRegionPhotos(['부산'])).resolves.toEqual([{
            region: '부산',
            imageUrl: '/api/tourism/region-photos/부산/image',
            src: '/api/tourism/region-photos/부산/image',
            workTitle: '부산 대표 관광 사진',
        }]);
        expect(api.get).toHaveBeenCalledWith('/api/tourism/region-photos', {
            params: { regions: '부산' },
        });
    });

    it('shows stored photos immediately and queries only newly visible provinces', async () => {
        const photo = { region: '부산', imageUrl: '/api/tourism/region-photos/부산/image' };
        api.get.mockResolvedValueOnce([photo]).mockResolvedValueOnce([]);

        await tourismService.getRegionPhotos(['부산']);
        expect(tourismService.getCachedRegionPhotos(['서울', '부산'])).toEqual([{ ...photo, src: photo.imageUrl }]);
        await tourismService.getRegionPhotos(['서울', '부산']);
        await tourismService.getRegionPhotos(['부산', '서울']);

        expect(api.get).toHaveBeenCalledTimes(2);
        expect(api.get.mock.calls[1][1].params.regions).toBe('서울');
    });

    it('keeps a known address visible through its monthly check and through a failed lookup', async () => {
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        const photo = { region: '부산', imageUrl: '/api/tourism/region-photos/부산/image' };
        const displayed = { ...photo, src: photo.imageUrl };
        api.get.mockResolvedValueOnce([photo]).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
        await tourismService.getRegionPhotos(['부산']);
        clock.mockReturnValue(now + 29 * 24 * 60 * 60 * 1000);
        await expect(tourismService.getRegionPhotos(['부산'])).resolves.toEqual([displayed]);
        expect(api.get).toHaveBeenCalledOnce();

        clock.mockReturnValue(now + 30 * 24 * 60 * 60 * 1000);
        expect(tourismService.getCachedRegionPhotos(['부산'])).toEqual([displayed]);
        await expect(tourismService.getRegionPhotos(['부산'])).rejects.toThrow('offline');
        expect(tourismService.getCachedRegionPhotos(['부산'])).toEqual([displayed]);

        await expect(tourismService.getRegionPhotos(['부산'])).resolves.toEqual([]);
        expect(tourismService.getCachedRegionPhotos(['부산'])).toEqual([]);
        await expect(tourismService.getRegionPhotos(['부산'])).resolves.toEqual([]);
        expect(api.get).toHaveBeenCalledTimes(3);
        clock.mockReturnValue(now + 30 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000);
        api.get.mockResolvedValueOnce([photo]);
        await expect(tourismService.getRegionPhotos(['부산'])).resolves.toEqual([displayed]);
        expect(api.get).toHaveBeenCalledTimes(4);
    });

    it('uses a legacy address during its next check and ignores a non-proxy address', async () => {
        const photo = { region: '부산', imageUrl: '/api/tourism/region-photos/부산/image' };
        window.localStorage.setItem('reserve:region-photo:v1:부산', JSON.stringify({ expiresAt: Date.now() - 1, photo }));
        window.localStorage.setItem('reserve:region-photo:v1:서울', JSON.stringify({
            checkAfter: Date.now() + 60 * 1000,
            photo: { region: '서울', imageUrl: 'https://example.test/서울.jpg' },
        }));
        api.get.mockResolvedValueOnce([photo]);

        expect(tourismService.getCachedRegionPhotos(['부산', '서울'])).toEqual([{ ...photo, src: photo.imageUrl }]);
        await tourismService.getRegionPhotos(['부산', '서울']);
        expect(api.get.mock.calls[0][1].params.regions).toBe('부산,서울');
    });
});
