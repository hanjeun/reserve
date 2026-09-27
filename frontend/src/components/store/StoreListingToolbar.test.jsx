import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoreListingToolbar from './StoreListingToolbar';

const props = {
    view: 'cards',
    onViewChange: vi.fn(),
    regionOpen: false,
    onRegionOpen: vi.fn(),
    domain: 'ALL',
    onDomainChange: vi.fn(),
    sort: 'rating',
    onSortChange: vi.fn(),
    sortOptions: [{ value: 'rating', label: '별점순' }],
};

describe('StoreListingToolbar', () => {
    it('uses an icon-only region trigger and marks an applied region as active', () => {
        const { rerender } = render(<StoreListingToolbar {...props} />);
        const allRegion = screen.getByRole('button', { name: '지역 필터, 전체 지역' });
        expect(allRegion).toHaveTextContent('');
        expect(allRegion).not.toHaveClass('is-active');
        expect(screen.getByRole('button', { name: '가게 정렬' }).querySelector('.anticon-sort-ascending')).toBeNull();

        rerender(<StoreListingToolbar {...props} region="서울" />);
        expect(screen.getByRole('button', { name: /지역 필터, 서울/ })).toHaveClass('is-active');
    });

    it('disables every query-changing control while the list is loading', () => {
        render(<StoreListingToolbar {...props} disabled />);
        expect(screen.getByRole('button', { name: '목록형 보기로 전환' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '지역 필터, 전체 지역' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '서비스 분야' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '가게 정렬' })).toBeDisabled();
    });
});
