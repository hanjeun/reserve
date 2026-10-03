import { StrictMode, Suspense, lazy, useMemo } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import Bone from '../common/Bone';
import { LoadingPresentationContext, createLoadingPresentation, useSkeletonShown } from './loadingPresentation';

function Content({ children }) {
    const shown = useSkeletonShown();
    return <main data-testid="content" data-skeleton-shown={shown ? 'true' : undefined}>{children}</main>;
}
function Navigation({ navigationKey = 'first', loading = false, children = <p>내용</p> }) {
    const presentation = useMemo(() => createLoadingPresentation(navigationKey), [navigationKey]);
    return <LoadingPresentationContext.Provider value={presentation}><Content>{loading ? <Bone /> : children}</Content></LoadingPresentationContext.Provider>;
}

describe('one loading presentation per navigation', () => {
    afterEach(() => vi.restoreAllMocks());
    beforeEach(() => {
        // jsdom에는 레이아웃 엔진이 없다. 보이는 골격의 사각형 유무만 모델링한다.
        vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
            return this.closest('[hidden]') ? [] : [{ width: 100, height: 14 }];
        });
    });
    it('remembers committed data skeletons after the data replaces them', () => {
        const { rerender } = render(<StrictMode><Navigation loading /></StrictMode>);
        expect(screen.getByTestId('content')).toHaveAttribute('data-skeleton-shown', 'true');
        rerender(<StrictMode><Navigation /></StrictMode>);
        expect(screen.getByTestId('content')).toHaveTextContent('내용');
        expect(screen.getByTestId('content')).toHaveAttribute('data-skeleton-shown', 'true');
    });

    it('allows existing entrance motion when cached data is ready, including a later navigation', () => {
        const { rerender } = render(<Navigation loading />);
        rerender(<Navigation navigationKey="cached" />);
        expect(screen.getByTestId('content')).not.toHaveAttribute('data-skeleton-shown');
        rerender(<Navigation navigationKey="uncached" loading />);
        expect(screen.getByTestId('content')).toHaveAttribute('data-skeleton-shown', 'true');
    });

    it('does not mistake a background request with visible data for a skeleton', () => {
        render(<Navigation><p aria-busy="true">캐시된 내용</p></Navigation>);
        expect(screen.getByTestId('content')).not.toHaveAttribute('data-skeleton-shown');
    });

    it('keeps cached page motion available while a map, calendar or photo loads locally', () => {
        const { container } = render(<Navigation><p>캐시된 내용</p><Bone pageLoading={false} /></Navigation>);
        expect(screen.getByTestId('content')).not.toHaveAttribute('data-skeleton-shown');
        expect(container.querySelector('.reserve-skeleton-block--local')).toBeInTheDocument();
    });

    it('ignores skeletons in a separately opened messenger instead of suppressing the page entrance', () => {
        render(<Navigation><p>캐시된 페이지</p><LoadingPresentationContext.Provider value={null}><Bone /></LoadingPresentationContext.Provider></Navigation>);
        expect(screen.getByTestId('content')).not.toHaveAttribute('data-skeleton-shown');
    });

    it('does not treat an inactive, hidden tab skeleton as a visible loading phase', () => {
        render(<Navigation><p>캐시된 탭</p><div hidden><Bone /></div></Navigation>);
        expect(screen.getByTestId('content')).not.toHaveAttribute('data-skeleton-shown');
    });

    it('retains the chunk fallback observation through Suspense replacement', async () => {
        let resolve;
        const Page = lazy(() => new Promise(yes => { resolve = yes; }));
        render(<Navigation><Suspense fallback={<Bone />}><Page /></Suspense></Navigation>);
        expect(screen.getByTestId('content')).toHaveAttribute('data-skeleton-shown', 'true');
        await act(async () => resolve({ default: () => <p>준비 완료</p> }));
        expect(screen.getByTestId('content')).toHaveTextContent('준비 완료');
        expect(screen.getByTestId('content')).toHaveAttribute('data-skeleton-shown', 'true');
    });

    it('notifies once even with many bones and cleans up subscribers', () => {
        const presentation = createLoadingPresentation('route');
        let notifications = 0;
        const unsubscribe = presentation.subscribe(() => notifications++);
        presentation.markSkeletonShown();
        presentation.markSkeletonShown();
        unsubscribe();
        expect(notifications).toBe(1);
        expect(presentation.getSnapshot()).toBe(true);
        expect(createLoadingPresentation('next').getSnapshot()).toBe(false);
    });

    it('suppresses only entrance selectors and preserves reduced motion and exit patterns', () => {
        const css = readFileSync('src/styles/global/discovery-motion.css', 'utf8');
        const suppression = css.match(/\/\* 초기 데이터 표시[\s\S]*?animation: none !important; \}/)?.[0];
        expect(suppression).not.toContain('reserve-search-page--entering');
        expect(suppression).toContain('reserve-header-back:not(.reserve-header-back--leaving)');
        expect(suppression).not.toContain('.is-closing');
        expect(suppression).not.toContain('messenger');
        expect(suppression).not.toContain('reserve-messages-route');
        expect(css).toContain('prefers-reduced-motion: reduce');
        expect(css).toContain('from-right:not([data-skeleton-shown="true"])');
    });
});
