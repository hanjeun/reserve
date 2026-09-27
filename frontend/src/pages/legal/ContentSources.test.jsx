import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ContentSources from './ContentSources';
import { tourismService } from '../../services';

vi.mock('../../services', () => ({
    tourismService: { getRegionPhotoCatalog: vi.fn() },
}));

const renderContentSources = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ContentSources />
    </QueryClientProvider>,
);

describe('ContentSources', () => {
    beforeEach(() => tourismService.getRegionPhotoCatalog.mockResolvedValue([
        {
            region: '경기',
            provider: '한국관광공사 관광정보 서비스',
            workTitle: '양주_가나아트파크 (1)',
            sourceUrl: 'https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y',
            license: '공공누리 제1유형',
            contentId: '129194',
            checkedAt: '2026-09-20T17:21:12.058776',
        },
        {
            region: '서울',
            provider: '한국관광공사 관광정보 서비스',
            workTitle: '서울_가락농수산물종합도매시장 (3)',
            sourceUrl: 'https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y',
            license: '공공누리 제1유형',
            contentId: '132215',
            checkedAt: '2026-09-20T17:21:12.647122',
        },
    ]));

    it('lists only the server-verified tourism catalog with a directly reachable source', async () => {
        renderContentSources();

        expect(screen.getByRole('heading', { name: '콘텐츠 출처·권리 안내' })).toBeInTheDocument();
        expect(await screen.findByRole('link', { name: /양주_가나아트파크/ })).toHaveAttribute(
            'href',
            'https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y',
        );
        expect(screen.getByRole('link', { name: /서울_가락농수산물종합도매시장/ })).toHaveAttribute(
            'href',
            'https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y',
        );
        expect(screen.getAllByText('공공누리 제1유형')).toHaveLength(2);
        expect(screen.getByRole('heading', { name: 'RESERVE 자체 제작 시각 자산' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '서드파티 라이선스 고지 보기' })).toHaveAttribute(
            'href',
            'https://github.com/hanjeun/reserve/blob/dev/THIRD_PARTY_NOTICES.md',
        );
    });
});
