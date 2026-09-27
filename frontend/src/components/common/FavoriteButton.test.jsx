import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FavoriteButton from './FavoriteButton';

vi.mock('@tanstack/react-query', () => ({
    useQuery: () => ({ data: false }),
    useMutation: () => ({ isPending: false, mutate: vi.fn() }),
    useQueryClient: () => ({}),
}));
vi.mock('../../store/useAuthStore', () => ({ default: selector => (typeof selector === 'function' ? selector({ isLoggedIn: true }) : { isLoggedIn: true }) }));
vi.mock('../../hooks', () => ({ useMessage: () => ({ message: { success: vi.fn(), error: vi.fn() } }) }));

describe('favorite button appearance', () => {
    it('keeps a 44px tap target without a circular background in plain mode', () => {
        render(<FavoriteButton storeId={12} size="sm" appearance="plain" />);
        const button = screen.getByRole('button', { name: '즐겨찾기 추가' });

        expect(button).toHaveClass('reserve-favorite-button--plain');
        expect(button).toHaveStyle({ width: '44px', height: '44px', background: 'transparent', boxShadow: 'none', borderRadius: '0' });
        expect(button).toHaveAttribute('aria-pressed', 'false');
    });

    it('preserves the existing overlay appearance by default', () => {
        render(<FavoriteButton storeId={12} size="sm" />);
        const button = screen.getByRole('button', { name: '즐겨찾기 추가' });

        expect(button).not.toHaveClass('reserve-favorite-button--plain');
        expect(button).toHaveStyle({ width: '36px', height: '36px', borderRadius: '50%' });
    });
});
