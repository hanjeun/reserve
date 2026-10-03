import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteSkeletonPreview } from './RouteLoadingSkeleton';
import { usePageSkeletonModule } from './routeSkeletonLoader';
import { createLoadingPresentation, LoadingPresentationContext } from './loadingPresentation';

vi.mock('./routeSkeletonLoader', () => ({ usePageSkeletonModule: vi.fn() }));

describe('pending route skeleton presentation', () => {
    it('holds the viewport until the skeleton arrives and records only its committed content', () => {
        vi.mocked(usePageSkeletonModule).mockReturnValue(null);
        const presentation = createLoadingPresentation('cold-navigation');
        const content = (
            <LoadingPresentationContext.Provider value={presentation}>
                <RouteSkeletonPreview pathname="/search" />
            </LoadingPresentationContext.Provider>
        );
        const { container, rerender } = render(content);
        const status = screen.getByRole('status', { name: '화면을 불러오는 중' });
        expect(status).toHaveAttribute('aria-busy', 'true');
        expect(status.tagName).toBe('OUTPUT');
        const visual = status.parentElement.querySelector('[inert]');
        expect(visual).toHaveAttribute('inert');
        expect(visual).toHaveAttribute('aria-hidden', 'true');
        expect(status).not.toContainElement(visual);
        expect(visual.firstElementChild).toHaveStyle({ minHeight: 'calc(100svh - 64px)' });
        expect(presentation.getSnapshot()).toBe(false);

        vi.mocked(usePageSkeletonModule).mockReturnValue({ default: () => <div className="arrived-skeleton">검색 골격</div> });
        rerender(
            <LoadingPresentationContext.Provider value={presentation}>
                <RouteSkeletonPreview pathname="/search" />
            </LoadingPresentationContext.Provider>,
        );
        expect(container.querySelector('.arrived-skeleton')).toHaveTextContent('검색 골격');
        expect(presentation.getSnapshot()).toBe(true);
        expect(status.parentElement).toHaveClass('reserve-route-skeleton--search');
    });
});
