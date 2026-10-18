import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeListQueryParams } from '../utils/listQueryParams';

/** 주소 보정은 새 기록을 만들지 않고 현재 필터·복귀 상태·해시를 보존한다. */
export default function useListQueryNormalization(searchParams, resolvedSelections = {}) {
    const { pathname, hash, state } = useLocation();
    const navigate = useNavigate();
    const search = searchParams.toString();
    const selectionsKey = JSON.stringify(resolvedSelections);
    useEffect(() => {
        const normalized = normalizeListQueryParams(pathname, searchParams);
        Object.entries(JSON.parse(selectionsKey)).forEach(([key, value]) => normalized.set(key, String(key === 'region' ? value || 'all' : value)));
        if (normalized.toString() === search) return;
        navigate({ pathname, search: normalized.size ? `?${normalized}` : '', hash }, { replace: true, state });
    }, [hash, navigate, pathname, search, searchParams, selectionsKey, state]);
}
