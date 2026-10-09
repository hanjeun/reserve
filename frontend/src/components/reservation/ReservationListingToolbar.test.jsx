import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReservationListingToolbar from './ReservationListingToolbar';

describe('ReservationListingToolbar', () => {
    it('keeps status and sort compact without leading icons', () => {
        render(
            <ReservationListingToolbar
                view="list"
                onViewChange={vi.fn()}
                status="ALL"
                onStatusChange={vi.fn()}
                statusOptions={[{ value: 'ALL', label: '전체 상태' }]}
                sort="recent"
                onSortChange={vi.fn()}
                sortOptions={[{ value: 'recent', label: '최신 예약순' }]}
                count={1}
                disabled={false}
            />,
        );

        const status = screen.getByRole('button', { name: '예약 상태' });
        const sort = screen.getByRole('button', { name: '예약 정렬' });
        expect(status).toHaveTextContent('전체 상태');
        expect(sort).toHaveTextContent('최신 예약순');
        expect(status.querySelector('.anticon-check-circle')).toBeNull();
        expect(sort.querySelector('.anticon-sort-ascending')).toBeNull();
    });

    it('locks the view and menus together while reservation data is loading', () => {
        render(
            <ReservationListingToolbar
                view="cards" onViewChange={vi.fn()}
                status="ALL" onStatusChange={vi.fn()}
                statusOptions={[{ value: 'ALL', label: '전체 상태' }]}
                sort="recent" onSortChange={vi.fn()}
                sortOptions={[{ value: 'recent', label: '최신 예약순' }]}
                disabled
            />,
        );
        expect(screen.getByRole('button', { name: '목록형 보기로 전환' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '예약 상태' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '예약 정렬' })).toBeDisabled();
    });

    it('shows why only the store filter is temporarily unavailable', () => {
        render(
            <ReservationListingToolbar
                view="list" onViewChange={vi.fn()}
                store="ALL" onStoreChange={vi.fn()}
                storeOptions={[{ value: 'ALL', label: '전체 가게' }]}
                storeDisabled storeLoading
                status="ALL" onStatusChange={vi.fn()}
                statusOptions={[{ value: 'ALL', label: '전체 상태' }]}
                sort="recent" onSortChange={vi.fn()}
                sortOptions={[{ value: 'recent', label: '최신 예약순' }]}
                disabled={false}
            />,
        );

        const storeFilter = screen.getByRole('button', { name: '가게 필터' });
        expect(storeFilter).toBeDisabled();
        expect(storeFilter).toHaveAttribute('aria-busy', 'true');
        expect(storeFilter.querySelector('.reserve-arc-spinner')).not.toBeNull();
        expect(screen.getByRole('button', { name: '예약 상태' })).toBeEnabled();
    });
});
