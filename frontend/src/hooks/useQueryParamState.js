import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { WorkspaceActivityContext } from '../components/layout/workspaceActivity';
import { VIEW_MODES } from '../utils/viewMode';
import { readQuerySelection, writeQuerySelection } from '../utils/querySelection';

/*
 * 함께 바뀌는 URL 값은 한 번에 갱신해 이전 스냅샷의 덮어쓰기를 막는다. 비활성 워크스페이스는 자신의 스냅샷만 유지한다.
 */
const isEmptySelection = key => writeQuerySelection(key, '') === 'all' || /Store$/.test(key);

export const useQueryParamsState = (defaults, options = Object.keys(defaults)) => {
    const activeKeys = Array.isArray(options) ? options : options.keys ?? Object.keys(defaults);
    const privateKeys = Array.isArray(options) ? [] : options.privateKeys ?? [];
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
    const defaultsKey = JSON.stringify(defaults);
    const activeKeysKey = JSON.stringify(activeKeys);
    const privateKeysKey = JSON.stringify(privateKeys);
    const [memory, setMemory] = useState({ values: {}, pending: null });
    const current = active ? memory.pending?.from === location.key
        ? new URLSearchParams(memory.pending.search) : searchParams : snapshot;
    if (memory.pending && memory.pending.from !== location.key) setMemory({ ...memory, pending: null });

    useEffect(() => {
        if (!active || !activeRef.current) return;
        const params = new URLSearchParams(searchParams);
        const visibleKeys = new Set(JSON.parse(activeKeysKey));
        const memoryKeys = new Set(JSON.parse(privateKeysKey));
        Object.entries(JSON.parse(defaultsKey)).forEach(([key, value]) => {
            if (memoryKeys.has(key)) { params.delete(key); return; }
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
    }, [active, activeKeysKey, defaultsKey, hash, navigate, pathname, privateKeysKey, searchParams, state]);

    const values = {};
    Object.keys(defaults).forEach((key) => {
        values[key] = privateKeys.includes(key) ? memory.values[key] ?? defaults[key]
            : readQuerySelection(key, current.get(key)) ?? defaults[key];
    });

    const setValues = useCallback((patch, options = {}) => {
        // 숨겨진 관리자 작업의 페이지 보정이 현재 작업의 URL을 덮어쓰지 않는다.
        if (!active || !activeRef.current) return;
        const stableDefaults = JSON.parse(defaultsKey);
        const latest = locationRef.current;
        const params = new URLSearchParams(latest.search);
        const memoryKeys = new Set(JSON.parse(privateKeysKey));
        const privatePatch = {};
        memoryKeys.forEach(key => params.delete(key));
        Object.entries(patch).forEach(([key, val]) => {
            if (memoryKeys.has(key)) { privatePatch[key] = val ?? stableDefaults[key]; return; }
            if (val == null || val === '' && stableDefaults[key] === '' && !isEmptySelection(key)) params.delete(key);
            else params.set(key, String(writeQuerySelection(key, val)));
        });
        const changesUrl = params.toString() !== new URLSearchParams(latest.search).toString();
        // 메모리 검색과 주소의 페이지가 서로 다른 렌더에 반영돼 중간 조회가 생기지 않게 한다.
        if (Object.keys(privatePatch).length) setMemory(previous => ({
            values: { ...previous.values, ...privatePatch },
            pending: changesUrl ? { from: latest.key, search: params.toString() } : null,
        }));
        if (changesUrl) {
            navigate({ pathname: latest.pathname, search: params.size ? `?${params}` : '', hash: latest.hash },
                { replace: true, state: latest.state, ...options });
        }
        // defaults는 각 탭에서 렌더마다 새 객체 리터럴로 넘어오지만 그 내용(키/기본값)은 사실상
        // 고정이라 JSON.stringify로 값 비교해서 불필요한 재생성을 막는다.
    }, [active, defaultsKey, navigate, privateKeysKey]);

    return [values, setValues];
};

export default useQueryParamsState;
