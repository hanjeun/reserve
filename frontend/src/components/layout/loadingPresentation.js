import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from 'react';

export const LoadingPresentationContext = createContext(null);

// 한 번의 이동 안에서 실제로 커밋된 골격만 기록한다. 요청 여부나 캐시 유무를 추측하지 않는다.
export function createLoadingPresentation(navigationKey) {
    let shown = false;
    const listeners = new Set();
    return {
        navigationKey,
        getSnapshot: () => shown,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        markSkeletonShown: () => {
            if (shown) return;
            shown = true;
            listeners.forEach(listener => listener());
        },
    };
}

const subscribeWithoutProvider = () => () => {};
const noSkeleton = () => false;

export function useSkeletonShown() {
    const presentation = useContext(LoadingPresentationContext);
    return useSyncExternalStore(presentation?.subscribe ?? subscribeWithoutProvider,
        presentation?.getSnapshot ?? noSkeleton, noSkeleton);
}

export function useMarkSkeletonShown(elementRef, pageLoading = true) {
    const presentation = useContext(LoadingPresentationContext);
    useLayoutEffect(() => {
        if (!presentation || !pageLoading) return;
        // 숨긴 탭·메신저에 남아 있는 골격을 실제 페이지 로딩으로 오인하지 않는다.
        if (elementRef && !elementRef.current?.getClientRects().length) return;
        presentation.markSkeletonShown();
    }, [presentation, elementRef, pageLoading]);
}
