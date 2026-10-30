import { StrictMode, Suspense, lazy, useMemo } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import Bone from '../common/Bone';
import { LoadingPresentationContext, createLoadingPresentation, useDocumentEntry, useRouteLoadingPresentation, useSkeletonShown } from './loadingPresentation';

function Content({ children }) {
    const shown = useSkeletonShown();
    return <main data-testid="content" data-skeleton-shown={shown ? 'true' : undefined}>{children}</main>;
}
function Navigation({ navigationKey = 'first', loading = false, children = <p>내용</p> }) {
    const presentation = useMemo(() => createLoadingPresentation(navigationKey), [navigationKey]);
    return <LoadingPresentationContext.Provider value={presentation}><Content>{loading ? <Bone /> : children}</Content></LoadingPresentationContext.Provider>;
}
function DocumentMarker() {
    const documentEntry = useDocumentEntry();
    return <output data-testid="document-entry">{String(documentEntry)}</output>;
}
function RouteNavigation({ loading }) {
    const location = useLocation();
    const navigate = useNavigate();
    const presentation = useRouteLoadingPresentation(location, useNavigationType());
    return <LoadingPresentationContext.Provider value={presentation}>
        <Content>{loading && <Bone />}<DocumentMarker /></Content>
        <button onClick={() => navigate('?region=all', { replace: true })}>주소 보정</button>
        <button onClick={() => navigate('/my-page')}>새 화면</button>
    </LoadingPresentationContext.Provider>;
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

    it('retains the document and skeleton phase through same-page replacement, then starts a fresh navigation', () => {
        const tree = loading => <MemoryRouter initialEntries={['/']}><RouteNavigation loading={loading} /></MemoryRouter>;
        const view = render(tree(true));
        expect(screen.getByTestId('content')).toHaveAttribute('data-skeleton-shown', 'true');
        expect(screen.getByTestId('document-entry')).toHaveTextContent('true');
        view.rerender(tree(false));
        fireEvent.click(screen.getByRole('button', { name: '주소 보정' }));
        expect(screen.getByTestId('content')).toHaveAttribute('data-skeleton-shown', 'true');
        expect(screen.getByTestId('document-entry')).toHaveTextContent('true');
        fireEvent.click(screen.getByRole('button', { name: '새 화면' }));
        expect(screen.getByTestId('content')).not.toHaveAttribute('data-skeleton-shown');
        expect(screen.getByTestId('document-entry')).toHaveTextContent('false');
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
        expect(suppression).toContain('.fade-in-up');
        expect(suppression).not.toContain('reserve-header');
        expect(suppression).not.toContain('.is-closing');
        expect(suppression).not.toContain('messenger');
        expect(suppression).not.toContain('reserve-messages-route');
        expect(css).toContain('prefers-reduced-motion: reduce');
        expect(css).toContain('.reserve-route-entry--from-right {');
        expect(css).not.toContain('from-right:not([data-skeleton-shown="true"])');
    });
});
