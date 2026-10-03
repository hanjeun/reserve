import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { VIEW_MODES, viewStorageKey, resolveViewMode } from '../utils/viewMode';
import { normalizeListQueryParams } from '../utils/listQueryParams';

const writeStoredView = (storageKey, view) => {
    try {
        sessionStorage.setItem(storageKey, view);
    } catch {
        // 시크릿 모드·저장소 제한에서는 URL 계약만 유지한다.
    }
};

/**
 * 카드/목록 보기를 URL에 명시하고, 같은 탭에서 페이지를 다시 열 때도 마지막 보기를 복원한다.
 *
 * 보기 전환은 같은 조회 결과의 표현만 바꾸므로 지원하는 필터·유입 파라미터를 보존한다.
 * URL에 값이 있으면 공유·새로고침 계약을 우선하고, 값이 없을 때만 경로별 sessionStorage를 쓴다.
 */
export default function useViewModeParam(searchParams, setSearchParams, defaultView) {
    const { pathname } = useLocation();
    const rawView = searchParams.get('view');
    const storageKey = viewStorageKey(pathname);
    // URL 값이 아예 없을 때만 같은 탭의 마지막 보기를 복원한다. 잘못된 URL 값까지
    // 저장된 보기로 대체하면 공유 링크가 이전 화면 상태에 따라 달라진다.
    const view = resolveViewMode(pathname, searchParams, defaultView);
    const search = searchParams.toString();

    useEffect(() => {
        const normalized = normalizeListQueryParams(pathname, searchParams);
        normalized.set('view', view);
        if (normalized.toString() === search) {
            writeStoredView(storageKey, rawView);
            return;
        }
        setSearchParams(current => {
            const next = normalizeListQueryParams(pathname, current);
            next.set('view', resolveViewMode(pathname, current, defaultView));
            return next;
        }, { replace: true });
    }, [defaultView, pathname, rawView, search, searchParams, setSearchParams, storageKey, view]);

    const setView = useCallback((nextView) => {
        if (!VIEW_MODES.has(nextView)) return;
        writeStoredView(storageKey, nextView);
        setSearchParams(current => {
            const next = normalizeListQueryParams(pathname, current);
            next.set('view', nextView);
            return next;
        });
    }, [pathname, setSearchParams, storageKey]);

    return [view, setView];
}
