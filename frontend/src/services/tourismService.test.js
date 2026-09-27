import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../api/axios';
import tourismService from './tourismService';

vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }));

describe('tourismService', () => {
    beforeEach(() => api.get.mockReset());

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
});
