import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore } from 'react';

export const LoadingPresentationContext = createContext(null);

// 한 번의 이동 안에서 실제로 커밋된 골격만 기록한다. 요청 여부나 캐시 유무를 추측하지 않는다.
export function createLoadingPresentation(navigationKey, { documentEntry = false } = {}) {
    let shown = false;
    const listeners = new Set();
    return {
        navigationKey,
        documentEntry,
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

/** 새 문서 진입과 앱 안의 이동을 구분하고 같은 화면의 교체는 모션 이력을 유지해요. */
export function useRouteLoadingPresentation({ pathname, key }, navigationType) {
    const [entry, setEntry] = useState(() => ({
        pathname, key, presentation: createLoadingPresentation(key, { documentEntry: true }),
    }));
    if (entry.key === key) return entry.presentation;
    // URL 기본값·안내 상태 정리는 같은 화면의 로딩 이력을 유지해요.
    const samePageReplacement = navigationType === 'REPLACE' && entry.pathname === pathname;
    const next = { pathname, key, presentation: samePageReplacement
        ? entry.presentation : createLoadingPresentation(key) };
    setEntry(next);
    return next.presentation;
}

export function useDocumentEntry() {
    return useContext(LoadingPresentationContext)?.documentEntry ?? false;
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
