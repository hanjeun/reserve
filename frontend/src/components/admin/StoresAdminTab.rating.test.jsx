import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoresAdminTab from './StoresAdminTab';

const state = vi.hoisted(() => ({ store: {} }));
vi.mock('@tanstack/react-query', () => ({
    useQuery: () => ({ data: { stores: [state.store], totalElements: 1 }, isLoading: false, isFetching: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useMutation: () => ({ isPending: false }),
    keepPreviousData: value => value,
}));
vi.mock('../../api/axios', () => ({ default: {} }));
vi.mock('../../hooks', () => ({
    useMessage: () => ({ message: {}, confirm: vi.fn() }),
    useQueryParamsState: defaults => [defaults, vi.fn()],
}));
vi.mock('../../hooks/useDebounce', () => ({ default: value => value }));
vi.mock('./SanctionModal', () => ({ default: () => null }));
vi.mock('../common', () => ({
    Button: () => null, FilterToolbar: () => null, AdminTableSkeleton: () => null,
    DataTable: ({ columns, dataSource }) => <div data-testid="rating-cell">
        {columns.find(column => column.key === 'rating').render(dataSource[0].rating, dataSource[0])}
    </div>,
}));

describe('admin store rating display', () => {
    it.each([
        { rating: 0, reviewCount: 0, expected: '0.0 (0)' },
        { rating: 4.8, reviewCount: 0, expected: '0.0 (0)' },
        { rating: '4.7', reviewCount: '1200', expected: '4.7 (1,200)' },
        { rating: 'invalid', reviewCount: 3, expected: '0.0 (3)' },
    ])('uses the common star, score and parenthesized count: %j', store => {
        state.store = { id: 12, name: '가게', ...store };
        render(<StoresAdminTab />);
        const cell = screen.getByTestId('rating-cell');
        expect(cell).toHaveTextContent(store.expected);
        expect(cell.querySelector('[aria-hidden="true"] svg')).toBeTruthy();
        expect(cell).not.toHaveTextContent('NaN');
    });
});
