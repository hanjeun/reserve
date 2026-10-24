import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { WorkspaceActivityContext } from '../components/layout/workspaceActivity';
import { VIEW_MODES } from '../utils/viewMode';
import { readQuerySelection, writeQuerySelection } from '../utils/querySelection';

/**
 * 여러 URL 쿼리 값을 한 번의 탐색으로 갱신한다.
 * 검색어와 페이지처럼 함께 바뀌는 값은 하나의 patch로 전달해 이전 URL 스냅샷의 덮어쓰기를 피한다.
 * 선택 옵션·페이지의 기본값은 URL에 표시하고 빈 검색어는 생략한다.
 * 비활성 워크스페이스는 자신의 스냅샷을 유지하며 현재 라우트의 URL을 변경하지 않는다.
 * @example setQuery({ search: term, page: '1' })
 */
const isEmptySelection = key => writeQuerySelection(key, '') === 'all' || /Store$/.test(key);

export const useQueryParamsState = (defaults, activeKeys = Object.keys(defaults)) => {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const { pathname, hash, state } = location;
    const navigate = useNavigate();
    const locationRef = useRef(location);
    useLayoutEffect(() => { locationRef.current = location; }, [location]);
    const active = useContext(WorkspaceActivityContext);
    const activeRef = useRef(active);
    useLayoutEffect(() => { activeRef.current = active; return () => { activeRef.current = false; }; }, [active]);
    const [snapshot, setSnapshot] = useState(searchParams);
    if (active && snapshot.toString() !== searchParams.toString()) setSnapshot(searchParams);
    const current = active ? searchParams : snapshot;
    const defaultsKey = JSON.stringify(defaults);
    const activeKeysKey = JSON.stringify(activeKeys);

    useEffect(() => {
        if (!active || !activeRef.current) return;
        const params = new URLSearchParams(searchParams);
        const visibleKeys = new Set(JSON.parse(activeKeysKey));
        Object.entries(JSON.parse(defaultsKey)).forEach(([key, value]) => {
            if (!visibleKeys.has(key)) { params.delete(key); return; }
            const raw = params.get(key);
            const selection = value !== '' || isEmptySelection(key);
            if (key === 'view' && raw !== null && !VIEW_MODES.has(raw)) params.set(key, String(value));
            else if (raw === '' && writeQuerySelection(key, raw) === 'all') params.set(key, 'all');
            else if (raw === '' && value !== '') params.set(key, String(writeQuerySelection(key, value)));
            else if (raw === '' && !selection) params.delete(key);
            else if (raw !== null) params.set(key, writeQuerySelection(key, raw));
            else if (selection) params.set(key, String(writeQuerySelection(key, value)));
        });
        if (params.toString() === searchParams.toString()) return;
        navigate({ pathname, search: params.size ? `?${params}` : '', hash }, { replace: true, state });
    }, [active, activeKeysKey, defaultsKey, hash, navigate, pathname, searchParams, state]);

    const values = {};
    Object.keys(defaults).forEach((key) => {
        values[key] = readQuerySelection(key, current.get(key)) ?? defaults[key];
    });

    const setValues = useCallback((patch, options = {}) => {
        // 숨겨진 관리자 작업의 페이지 보정이 현재 작업의 URL을 덮어쓰지 않는다.
        if (!active || !activeRef.current) return;
        const stableDefaults = JSON.parse(defaultsKey);
        const latest = locationRef.current;
        const params = new URLSearchParams(latest.search);
        Object.entries(patch).forEach(([key, val]) => {
            if (val == null || val === '' && stableDefaults[key] === '' && !isEmptySelection(key)) params.delete(key);
            else params.set(key, String(writeQuerySelection(key, val)));
        });
        navigate({ pathname: latest.pathname, search: params.size ? `?${params}` : '', hash: latest.hash },
            { replace: true, state: latest.state, ...options });
        // defaults는 각 탭에서 렌더마다 새 객체 리터럴로 넘어오지만 그 내용(키/기본값)은 사실상
        // 고정이라 JSON.stringify로 값 비교해서 불필요한 재생성을 막는다.
    }, [active, defaultsKey, navigate]);

    return [values, setValues];
};

export default useQueryParamsState;
