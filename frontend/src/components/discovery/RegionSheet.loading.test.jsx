import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import postcss from 'postcss';
import RegionSheet from './RegionSheet';
import { storeService } from '../../services';
import regionSheetCss from '../../styles/global/region-sheet.css?raw';

vi.mock('../../services', () => ({
    storeService: { getRegions: vi.fn() },
    tourismService: { getRegionPhotos: vi.fn() },
}));
vi.mock('antd', () => ({
    Modal: ({ open, children }) => open ? <div role="dialog">{children}</div> : null,
    Skeleton: { Avatar: () => <i />, Input: () => <i /> },
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

const renderLoadingSheet = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RegionSheet open value="" onClose={vi.fn()} onApply={vi.fn()} />
    </QueryClientProvider>,
);

describe('RegionSheet loading placeholders', () => {
    it('reserves six popular-region items while the desktop response is pending', async () => {
        storeService.getRegions.mockReturnValue(new Promise(() => {}));
        const { container } = renderLoadingSheet();

        await screen.findByRole('status', { name: '인기 지역을 불러오는 중' });
        expect(container.querySelectorAll('.reserve-region-sheet-popular-placeholder')).toHaveLength(6);
    });

    it('keeps six desktop placeholders but hides the fifth and sixth in the phone sheet', () => {
        const root = postcss.parse(regionSheetCss);
        let desktopRule;
        let mobileRule;

        root.walkRules(rule => {
            if (rule.selector === '.reserve-region-sheet-popular-placeholder') desktopRule = rule;
            if (rule.selector === '.reserve-region-sheet-popular-placeholder:nth-of-type(n + 5)') mobileRule = rule;
        });

        expect(desktopRule.nodes.find(node => node.prop === 'display').value).toBe('flex');
        expect(mobileRule.parent.name).toBe('media');
        expect(mobileRule.parent.params).toBe('(max-width: 575px)');
        expect(mobileRule.nodes.find(node => node.prop === 'display').value).toBe('none');
    });
});
