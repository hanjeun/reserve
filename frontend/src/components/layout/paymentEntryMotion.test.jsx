import { StrictMode, useContext } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingPresentationContext, useDocumentEntry, useRouteLoadingPresentation, useSkeletonShown } from './loadingPresentation';
import { applyRouteEntryMotion } from './routeEntryMotion';

function EntryState() {
    const documentEntry = useDocumentEntry();
    const skeletonShown = useSkeletonShown();
    const presentation = useContext(LoadingPresentationContext);
    return <><output data-testid="entry">{String(documentEntry)}</output><output data-testid="skeleton">{String(skeletonShown)}</output>
        <button onClick={() => presentation.markSkeletonShown()}>골격 표시</button></>;
}
function Navigation({ pathname, navigationKey, navigationType = 'PUSH' }) {
    const presentation = useRouteLoadingPresentation({ pathname, key: navigationKey }, navigationType);
    return <LoadingPresentationContext.Provider value={presentation}><EntryState /></LoadingPresentationContext.Provider>;
}

describe('결제 복귀와 문서 진입 모션', () => {
    it('재로드한 문서와 이후 앱 이동을 구분하고 안내 상태 정리로 새 진입을 만들지 않아요', () => {
        const { rerender } = render(<StrictMode><Navigation pathname="/payment/result" navigationKey="restored-key" navigationType="POP" /></StrictMode>);
        expect(screen.getByTestId('entry')).toHaveTextContent('true');
        rerender(<StrictMode><Navigation pathname="/payment/result" navigationKey="normalize" navigationType="REPLACE" /></StrictMode>);
        expect(screen.getByTestId('entry')).toHaveTextContent('true');
        rerender(<StrictMode><Navigation pathname="/my-reservations" navigationKey="return" navigationType="REPLACE" /></StrictMode>);
        expect(screen.getByTestId('entry')).toHaveTextContent('false');
        rerender(<StrictMode><Navigation pathname="/payment/result" navigationKey="restored-key" navigationType="POP" /></StrictMode>);
        expect(screen.getByTestId('entry')).toHaveTextContent('false');
    });
    it('골격이 표시된 이동에서도 부모가 한 번 진입하고 본문 교체에 재시작하지 않아요', () => {
        const parent = document.createElement('main');
        applyRouteEntryMotion(parent, { pathnameChanged: true, direction: 'from-left', skeletonShown: true });
        expect(parent).toHaveClass('reserve-route-entry--from-left');
        parent.replaceChildren(document.createElement('section'));
        applyRouteEntryMotion(parent, { pathnameChanged: false, direction: null, skeletonShown: true });
        expect(parent).toHaveClass('reserve-route-entry--from-left');
        applyRouteEntryMotion(parent, { pathnameChanged: true, direction: null, skeletonShown: false });
        expect(parent).not.toHaveClass('reserve-route-entry--from-left');
    });
});
