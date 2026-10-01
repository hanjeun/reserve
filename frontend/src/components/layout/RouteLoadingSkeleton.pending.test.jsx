import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteSkeletonPreview } from './RouteLoadingSkeleton';
import { usePageSkeletonModule } from './routeSkeletonLoader';

vi.mock('./routeSkeletonLoader', () => ({ usePageSkeletonModule: vi.fn() }));

describe('pending route skeleton presentation', () => {
    it('holds the viewport until the route skeleton module arrives', () => {
        vi.mocked(usePageSkeletonModule).mockReturnValue(null);
        const { container, rerender } = render(<RouteSkeletonPreview pathname="/search" />);
        const status = screen.getByRole('status', { name: '화면을 불러오는 중' });
        expect(status).toHaveAttribute('aria-busy', 'true');
        expect(status.firstElementChild).toHaveAttribute('inert');
        expect(status.firstElementChild.firstElementChild).toHaveStyle({ minHeight: 'calc(100svh - 64px)' });
        vi.mocked(usePageSkeletonModule).mockReturnValue({ default: () => <div className="arrived-skeleton">검색 골격</div> });
        rerender(<RouteSkeletonPreview pathname="/search" />);
        expect(container.querySelector('.arrived-skeleton')).toHaveTextContent('검색 골격');
        expect(status).toHaveClass('reserve-route-skeleton--search');
    });
});
