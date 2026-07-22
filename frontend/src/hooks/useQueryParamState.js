import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL 쿼리스트링과 동기화되는 여러 값을 한 번에 관리하는 훅 (2026-07 추가).
 *
 * ★ 왜 여러 키를 "한 번에" 다뤄야만 하는가 (버그 수정) ─────────────────────────
 * 처음엔 키 하나짜리 useQueryParamState(key, default)로 만들어서 각 필드마다 따로 호출했는데,
 * 브라우저로 실측해보니 검색어를 입력하면 즉시 이어서 setPage(1)을 호출하는 흔한 패턴
 * (handleSearchChange = (e) => { setSearch(e.target.value); setPage(1); })에서
 * 검색어 쪽 URL 변경이 통째로 사라지는 버그가 있었다.
 *
 * 원인: react-router의 setSearchParams는 호출 시점의 검색 파라미터 스냅샷을 기준으로 새
 * URL을 계산해 navigate(..., {replace:true})를 실행한다. 같은 동기 이벤트 핸들러 안에서
 * (검색용 setter) → (페이지용 setter)를 연달아 부르면, 두 번째 호출이 첫 번째 호출이 아직
 * 반영되기 전의 스냅샷을 기준으로 새 URL을 계산해버려서, 결과적으로 나중에 실행된 두 번째
 * navigate가 첫 번째 변경을 덮어써 버린다(검색어 변경이 유실됨) — 실제로 브라우저에서
 * "한"을 타이핑해도 URL에 search= 파라미터가 전혀 안 생기는 것으로 확인됨.
 *
 * 해법: 검색어+페이지처럼 "같은 사용자 행동으로 동시에 바뀌어야 하는 값들"은 반드시
 * 하나의 setSearchParams 호출 안에서 함께 반영해야 한다. 그래서 키 하나짜리 훅 대신
 * "이 컴포넌트가 쓰는 모든 키의 기본값 객체"를 받아 { 값들, patch 함수 } 형태로 반환하고,
 * patch 함수는 여러 키를 한 번에 갱신하는 단일 setSearchParams 호출로 처리한다.
 *
 * 사용례:
 *   const [{ search, page }, setQuery] = useQueryParamsState({ search: '', page: '1' });
 *   const handleSearchChange = (e) => setQuery({ search: e.target.value, page: '1' });
 *   const setPage = (p) => setQuery({ page: String(p) });
 *
 * value가 기본값과 같아지면 그 key를 URL에서 지운다 — 기본 상태(검색어 없음, 1페이지 등)일 땐
 * URL이 `?tab=members`처럼 깨끗하게 유지된다.
 */
export const useQueryParamsState = (defaults) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const values = {};
    Object.keys(defaults).forEach((key) => {
        values[key] = searchParams.get(key) ?? defaults[key];
    });

    const setValues = useCallback((patch) => {
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            Object.entries(patch).forEach(([key, val]) => {
                const def = defaults[key];
                if (val == null || val === '' || val === def) {
                    params.delete(key);
                } else {
                    params.set(key, String(val));
                }
            });
            return params;
        }, { replace: true });
        // defaults는 각 탭에서 렌더마다 새 객체 리터럴로 넘어오지만 그 내용(키/기본값)은 사실상
        // 고정이라 JSON.stringify로 값 비교해서 불필요한 재생성을 막는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(defaults)]);

    return [values, setValues];
};

export default useQueryParamsState;
