import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import RegionSheet from './RegionSheet';
import { storeService, tourismService } from '../../services';

vi.mock('../../services', () => ({
    storeService: { getRegions: vi.fn() },
    tourismService: { getRegionPhotos: vi.fn() },
}));
vi.mock('antd', () => ({
    Modal: ({ open, children }) => open ? <div role="dialog">{children}</div> : null,
    Skeleton: { Avatar: () => null, Input: () => null },
}));
vi.mock('../common', () => ({
    Button: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>,
    DataState: ({ state = 'empty', title, onRetry }) => (
        <section role={state === 'error' ? 'alert' : undefined}>
            <span>{title}</span>
            {onRetry && <button type="button" onClick={onRetry}>다시 불러오기</button>}
        </section>
    ),
}));

describe('owner region sheet source', () => {
    beforeEach(() => {
        storeService.getRegions.mockReset();
        tourismService.getRegionPhotos.mockReset();
        tourismService.getRegionPhotos.mockResolvedValue([]);
    });

    it('uses owner-derived counts and the verified tourism proxy for every region', async () => {
        const user = userEvent.setup();
        const groups = [{ name: '경기', count: 2, areas: [{ name: '안산시', count: 2 }] }];
        tourismService.getRegionPhotos.mockResolvedValue([{
            region: '경기',
            imageUrl: '/api/tourism/region-photos/경기/image',
            provider: '한국관광공사 관광정보 서비스',
            workTitle: '경기 대표 관광 사진',
            license: '공공누리 제1유형',
        }]);
        const { container } = render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <RegionSheet open value="" availableGroups={groups} onClose={vi.fn()} onApply={vi.fn()} />
        </QueryClientProvider></MemoryRouter>);
        expect(storeService.getRegions).not.toHaveBeenCalled();
        await waitFor(() => expect(container.querySelector('img[src="/api/tourism/region-photos/경기/image"]')).toBeInTheDocument());
        expect(tourismService.getRegionPhotos).toHaveBeenCalledWith(['경기']);
        expect(screen.getByRole('link', { name: '사진·콘텐츠 출처 및 이용조건' })).toHaveAttribute(
            'href',
            '/content-sources#region-photos',
        );
        await user.click(screen.getByRole('button', { name: /^경기도\s*2$/ }));
        expect(screen.getByRole('button', { name: /^안산시\s*2$/ })).toBeInTheDocument();
    });

    it('uses only the backend proxy path for a verified photo without a static city asset', async () => {
        const groups = [{ name: '부산', count: 1, areas: [{ name: '중구', count: 1 }] }];
        tourismService.getRegionPhotos.mockResolvedValue([
            {
                region: '부산',
                imageUrl: '/api/tourism/region-photos/부산/image',
                provider: '한국관광공사 관광정보 서비스',
                workTitle: '부산 대표 관광 사진',
                license: '공공누리 제1유형',
            },
        ]);

        const { container } = render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <RegionSheet open value="" availableGroups={groups} onClose={vi.fn()} onApply={vi.fn()} />
        </QueryClientProvider></MemoryRouter>);

        await waitFor(() => expect(container.querySelector('img[src="/api/tourism/region-photos/부산/image"]')).toBeInTheDocument());
        expect(tourismService.getRegionPhotos).toHaveBeenCalledWith(['부산']);
    });

    it('keeps the sheet usable after a region path failure and recovers with the retry action', async () => {
        const user = userEvent.setup();
        storeService.getRegions
            .mockRejectedValueOnce(new Error('정보를 찾을 수 없습니다.'))
            .mockResolvedValueOnce([{ name: '경기', count: 1, areas: [{ name: '안산시', count: 1 }] }]);

        render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <RegionSheet open value="" onClose={vi.fn()} onApply={vi.fn()} />
        </QueryClientProvider></MemoryRouter>);

        expect(await screen.findByRole('alert')).toHaveTextContent('세부 지역을 불러오지 못했어요');
        expect(screen.getByRole('button', { name: /^서울특별시\s*0$/ })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByRole('button', { name: /^경기도\s*1$/ })).toBeInTheDocument();
        expect(storeService.getRegions).toHaveBeenCalledTimes(2);
    });
});
