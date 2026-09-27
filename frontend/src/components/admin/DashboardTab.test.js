import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import { fetchDashboardStats } from './dashboardStats';

vi.mock('../../api/axios', () => ({
    default: { get: vi.fn() },
}));

describe('admin dashboard aggregation', () => {
    beforeEach(() => vi.clearAllMocks());

    it('keeps successful sources visible and reports the failed source', async () => {
        api.get
            .mockResolvedValueOnce({ page: { totalElements: 12 } })
            .mockRejectedValueOnce(new Error('reservation unavailable'))
            .mockResolvedValueOnce({ content: [{ entityType: 'STORE' }], page: { totalElements: 81 } })
            .mockResolvedValueOnce({ content: [], page: { totalElements: 230 } });

        const stats = await fetchDashboardStats();

        expect(stats.totalBiz).toBe(12);
        expect(stats.totalRes).toBe('-');
        expect(stats.trashCount).toBe(81);
        expect(stats.logCount).toBe(230);
        expect(stats.failedSources).toEqual(['예약 집계']);
        expect(stats.sources.reservations).toBe(false);
    });

    it('fails the query when every independent source fails', async () => {
        api.get.mockRejectedValue(new Error('offline'));

        await expect(fetchDashboardStats()).rejects.toThrow('Every dashboard source failed');
    });
});
