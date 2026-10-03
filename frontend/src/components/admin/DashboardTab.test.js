import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { cloneElement, createElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { fetchDashboardStats } from './dashboardStats';
import DashboardTab from './DashboardTab';
import StatisticsTab from '../business/StatisticsTab';
import { chartPalette } from '../../styles/tokens';

vi.mock('../../api/axios', () => ({
    default: { get: vi.fn() },
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
    ...await importOriginal(),
    useQuery: vi.fn(),
}));

vi.mock('../../hooks/useMyStores', () => ({
    default: () => ({ stores: [{ id: 7, name: '검사 가게' }], loading: false }),
}));

vi.mock('../../hooks/useQueryParamState', () => ({
    useQueryParamsState: defaults => [{ ...defaults, statisticsStore: '7' }, vi.fn()],
}));

vi.mock('recharts', async importOriginal => {
    const actual = await importOriginal();
    return {
        ...actual,
        // jsdom has no measured layout; only fix chart size and disable motion.
        ResponsiveContainer: ({ children }) => cloneElement(children, { width: 130, height: 130 }),
        Pie: props => createElement(actual.Pie, { ...props, isAnimationActive: false }),
    };
});

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

    it('keeps both filtered status charts aligned with legend colors and no sector stroke', async () => {
        const statusCounts = { PENDING: 0, CONFIRMED: 3, UNCONFIRMED: 0, COMPLETED: 1 };
        api.get
            .mockResolvedValueOnce({ page: { totalElements: 1 } })
            .mockResolvedValueOnce({ total: 4, statusCounts })
            .mockResolvedValueOnce({ content: [], page: { totalElements: 0 } })
            .mockResolvedValueOnce({ content: [], page: { totalElements: 0 } });
        const dashboardStats = await fetchDashboardStats();
        const charts = [
            { Component: DashboardTab, title: '예약 상태 분포', data: dashboardStats },
            { Component: StatisticsTab, title: '상태별 분포', data: { statusBreakdown: statusCounts } },
        ];

        for (const { Component, title, data } of charts) {
            useQuery.mockReturnValue({ data, isLoading: false, isFetching: false, refetch: vi.fn() });
            const view = render(createElement(Component));
            const chart = screen.getByRole('region', { name: title });
            const sectors = chart.querySelectorAll('.recharts-pie-sector path');
            expect(sectors).toHaveLength(2);
            expect(chart.querySelector('svg')).toHaveAttribute('width', '130');
            expect(chart.querySelector('svg')).toHaveAttribute('height', '130');

            ['예약 확정', '이용 완료'].forEach((label, index) => {
                expect(sectors[index]).toHaveAttribute('fill', chartPalette[index]);
                expect(sectors[index]).toHaveAttribute('stroke', 'none');
                const legend = within(chart.querySelector('[aria-hidden="true"]')).getByText(label);
                expect(legend.previousElementSibling).toHaveStyle({ background: chartPalette[index] });
                expect(legend.parentElement).toHaveTextContent(index === 0 ? '3건' : '1건');
            });
            view.unmount();
        }
    });
});
