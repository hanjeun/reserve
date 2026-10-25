import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { VIEW_MODES, viewStorageKey, resolveViewMode } from '../utils/viewMode';
import { normalizeListQueryParams } from '../utils/listQueryParams';
import { readDiscoveryRegion } from '../utils/discoveryRegion';

const writeStoredView = (storageKey, view) => {
    try {
        sessionStorage.setItem(storageKey, view);
    } catch {
        // 시크릿 모드·저장소 제한에서는 URL 계약만 유지한다.
    }
};

const viewQueryParams = (pathname, params, view) => {
    const next = normalizeListQueryParams(pathname, params);
    next.set('view', view);
    if (/^\/(stores|waiting)\/?$/.test(pathname) && !next.has('region')) {
        next.set('region', readDiscoveryRegion() || 'all');
    }
    return next;
};

/*
 * URL의 보기 값을 우선하고 없을 때만 경로별 세션 저장값을 복원한다. 보기 전환은 기존 필터와 유입 파라미터를 보존한다.
 */
export default function useViewModeParam(searchParams, defaultView) {
    const { pathname, hash, state } = useLocation();
    const navigate = useNavigate();
    const storageKey = viewStorageKey(pathname);
    // URL 값이 아예 없을 때만 같은 탭의 마지막 보기를 복원한다. 잘못된 URL 값까지
    // 저장된 보기로 대체하면 공유 링크가 이전 화면 상태에 따라 달라진다.
    const view = resolveViewMode(pathname, searchParams, defaultView);
    const search = searchParams.toString();

    useEffect(() => {
        const normalized = viewQueryParams(pathname, searchParams, view);
        writeStoredView(storageKey, view);
        if (normalized.toString() === search) return;
        navigate({ pathname, search: normalized.size ? `?${normalized}` : '', hash }, { replace: true, state });
    }, [defaultView, hash, navigate, pathname, search, searchParams, state, storageKey, view]);

    const setView = useCallback((nextView) => {
        if (!VIEW_MODES.has(nextView)) return;
        writeStoredView(storageKey, nextView);
        const next = viewQueryParams(pathname, searchParams, nextView);
        navigate({ pathname, search: next.size ? `?${next}` : '', hash }, { state });
    }, [hash, navigate, pathname, searchParams, state, storageKey]);

    return [view, setView];
}
