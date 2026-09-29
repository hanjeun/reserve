import React, { useReducer, useState, useRef, useEffect, useCallback, useId } from 'react';
import PropTypes from 'prop-types';
import { EnvironmentOutlined } from '@ant-design/icons';
import api from '../../../api/axios';
import useDebounce from '../../../hooks/useDebounce';
import { colors, fontSize, radius, heights } from '../../../styles/tokens';
import { animation } from '../../../styles/tokens/animations';
import useExitAnimation from '../../../hooks/useExitAnimation';
import { ArcSpinner } from '../../common/Loading';
import DataState from '../../common/DataState';
import { API_ENDPOINTS } from '../../../constants';

// ─── 검색/선택 상태 리듀서 ─────────────────────────────────────────────────
// 원래 query/detail/zipCode/selected/results/open/loading/activeIdx 8개 useState로
// 나뉘어 있던 상태를 하나의 리듀서로 통합 (focused/detailFocused는 별도 activeField로 통합)
const initialState = {
    query: '',
    detail: '',
    zipCode: '',
    selected: false,
    results: [],
    open: false,
    loading: false,
    searchStatus: 'idle',
    activeIdx: -1,
    // ② 블록(우편번호+상세주소) 등장 시 slideUpIn 애니메이션을 재생할지.
    // 사용자가 드롭다운에서 직접 선택했을 때만 true — 마이페이지 처음 열 때의 초기
    // 프리필(zipCodeProp)에서는 false라 이미 있던 주소가 애니메이션 없이 바로 보인다.
    animateSection: false,
};

function reducer(state, action) {
    switch (action.type) {
        case 'RESET_FOR_VALUE':
            // value prop 주입(부모 폼 초기화) — 이미 있던 값이므로 애니메이션 없이.
            return { ...state, query: action.query, selected: true, results: [], open: false, loading: false, searchStatus: 'idle', activeIdx: -1, animateSection: false };
        case 'CLEAR_ALL':
            return { ...initialState };
        case 'SET_ZIPCODE':
            // 초기 프리필 — 애니메이션 없이 바로 표시.
            return { ...state, zipCode: action.zipCode, animateSection: false };
        case 'SET_DETAIL_VALUE':
            return { ...state, detail: action.detail };
        case 'SEARCH_LOADING':
            return { ...state, results: [], open: false, activeIdx: -1, loading: true, searchStatus: 'loading' };
        case 'SEARCH_RESULTS':
            return { ...state, results: action.results, open: action.results.length > 0, activeIdx: action.results.length > 0 ? 0 : -1, loading: false, searchStatus: 'success' };
        case 'SEARCH_EMPTY':
            return { ...state, results: [], open: false, activeIdx: -1, loading: false, searchStatus: 'idle' };
        case 'SEARCH_ERROR':
            return { ...state, results: [], open: false, activeIdx: -1, loading: false, searchStatus: 'error' };
        case 'QUERY_CHANGE':
            // 선택된 주소를 사용자가 직접 고치기 시작하면(편집 시작) 우편번호/상세주소를 함께 비운다.
            // 새 주소를 드롭다운에서 다시 선택할 때까지 아래 ② 블록(우편번호+상세주소)이 노출되지
            // 않도록 — 화면엔 새 주소를 타이핑 중인데 옛 우편번호/상세주소가 남아 어긋나 보이는 걸 막는다.
            return {
                ...state,
                query: action.value,
                selected: false,
                results: [], open: false, activeIdx: -1, loading: false, searchStatus: 'idle',
                ...(action.wasSelected ? { zipCode: '', detail: '' } : {}),
            };
        case 'DETAIL_CHANGE':
            return { ...state, detail: action.value };
        case 'SELECT_RESULT':
            // 사용자가 드롭다운에서 직접 선택 — 이때만 ② 블록이 slideUpIn으로 등장한다.
            return {
                ...state,
                query: action.road, zipCode: action.zone, detail: action.building,
                selected: true, results: [], open: false, activeIdx: -1,
                loading: false, searchStatus: 'idle',
                animateSection: true,
            };
        case 'CLOSE_DROPDOWN':
            return { ...state, open: false };
        case 'OPEN_IF_RESULTS':
            return state.results.length > 0 ? { ...state, open: true } : state;
        case 'ARROW_DOWN':
            return { ...state, activeIdx: state.activeIdx < state.results.length - 1 ? state.activeIdx + 1 : state.activeIdx };
        case 'ARROW_UP':
            return { ...state, activeIdx: state.activeIdx > 0 ? state.activeIdx - 1 : -1 };
        case 'SET_ACTIVE_IDX':
            return { ...state, activeIdx: action.idx };
        default:
            return state;
    }
}

// id prop: Form.Item이 label for 연결을 위해 주입 — 메인 input에 전달
const AddressSearch = ({ id, value = '', zipCode: zipCodeProp = '', addressDetail: addressDetailProp = '', onChange, onMeta, onDetailChange, placeholder = '도로명 또는 지번 주소를 검색하세요' }) => {
    const [state, dispatch] = useReducer(reducer, initialState);
    // focused/detailFocused 통합 — 동시에 둘 다 포커스될 수 없으므로 하나의 필드로 표현
    const [activeField, setActiveField] = useState(null); // null | 'query' | 'detail'

    const containerRef   = useRef(null);
    const skipBlurRef    = useRef(false);
    const detailRef      = useRef(null);
    const isEditMode     = useRef(false);
    // search()는 useCallback([]) 로 고정되어 클로저가 최초 상태를 캡처하므로,
    // 매 검색 시점의 최신 selected 값을 동기적으로 읽기 위한 ref 미러 (state.selected와 effect로 동기화)
    const selectedRef    = useRef(false);
    const queryRef       = useRef('');
    const searchRequestRef = useRef(0);
    const searchStatusId = useId();
    const touchState     = useRef({ startX: 0, scrollStart: 0 });
    const debouncedQuery = useDebounce(state.query, 400);

    // 드롭다운이 닫힐 때(선택/blur/ESC)도 슬라이드 아웃 애니메이션이 재생되도록.
    // SELECT_RESULT는 results를 즉시 []로 비우므로, 닫히는 애니메이션 동안 보여줄 마지막 결과를
    // 별도로 기억해둔다. effect+setState는 리렌더가 한 번 더 발생하고(cascading render 경고 대상),
    // ref는 렌더링 중 읽기/쓰기가 금지되어(이 프로젝트 lint 규칙) 둘 다 못 씀 — 대신 렌더링 도중
    // 이전 값과 비교해서 바로 setState하는, React 공식 문서의 "prop 변경 시 state 조정" 패턴 사용
    // (effect 없이 렌더 도중 호출하는 setState는 같은 렌더 사이클 안에서 처리되어 cascading이 아님).
    const [prevResultsRef, setPrevResultsRef] = useState(state.results);
    const [lastResults, setLastResults] = useState(state.results);
    if (state.results !== prevResultsRef) {
        setPrevResultsRef(state.results);
        if (state.results.length > 0) setLastResults(state.results);
    }
    const dropdownOpen = state.open && state.results.length > 0;
    const { shouldRender: dropdownShouldRender, isClosing: dropdownClosing } = useExitAnimation(dropdownOpen, 200);

    // ② 블록(우편번호+상세주소)도 드롭다운과 같은 규칙을 따른다.
    // 2026-08-06 이전엔 여기가 그냥 `{(selected || zipCode) && ...}` 였다 — 등장은 slideUpIn 이
    // 재생되는데 주소를 지우면 **애니메이션 없이 툭 사라졌다.** 훅이 이미 있는데 드롭다운에만
    // 걸려 있던 케이스라, 같은 훅을 통과시켜 좌우 대칭을 맞춘다.
    const sectionOpen = state.selected || !!state.zipCode;
    const { shouldRender: sectionShouldRender, isClosing: sectionClosing } = useExitAnimation(sectionOpen, 200);
    // 닫히는 200ms 동안 state.zipCode/detail 은 이미 비워져 있다. 그대로 그리면 슬라이드가
    // 시작되기도 전에 내용이 사라져 "빈 상자만 내려가는" 모양이 된다 —
    // 위 lastResults 와 같은 패턴으로 마지막 값을 붙잡아 둔다.
    const [lastSection, setLastSection] = useState({ zipCode: '', detail: '' });
    if (sectionOpen && (lastSection.zipCode !== state.zipCode || lastSection.detail !== state.detail)) {
        setLastSection({ zipCode: state.zipCode, detail: state.detail });
    }
    const section = sectionClosing ? lastSection : { zipCode: state.zipCode, detail: state.detail };

    useEffect(() => { selectedRef.current = state.selected; }, [state.selected]);

    useEffect(() => {
        searchRequestRef.current += 1;
        queryRef.current = value?.trim() || '';
        selectedRef.current = !!value?.trim();
        if (value?.trim()) {
            dispatch({ type: 'RESET_FOR_VALUE', query: value.trim() });
            isEditMode.current = true;
        } else {
            dispatch({ type: 'CLEAR_ALL' });
            isEditMode.current = false;
        }
    }, [value]);

    // 서버값뿐 아니라 form.setFieldsValue로 복원한 초안도 동기화한다. 빈 문자열도 반영해야
    // "새로 작성"이나 주소 재선택 뒤에 예전 우편번호가 화면에 남지 않는다.
    useEffect(() => {
        if (zipCodeProp !== state.zipCode) dispatch({ type: 'SET_ZIPCODE', zipCode: zipCodeProp });
    }, [state.zipCode, zipCodeProp]);
    useEffect(() => {
        if (addressDetailProp !== state.detail) dispatch({ type: 'SET_DETAIL_VALUE', detail: addressDetailProp });
    }, [addressDetailProp, state.detail]);

    const emitChange = useCallback((road) => { onChange?.(road); }, [onChange]);

    const search = useCallback(async (q) => {
        const query = q?.trim() || '';
        if (query !== queryRef.current.trim()) return;
        const requestId = ++searchRequestRef.current;
        if (query.length < 3 || selectedRef.current) {
            if (!selectedRef.current) dispatch({ type: 'SEARCH_EMPTY' });
            return;
        }
        dispatch({ type: 'SEARCH_LOADING' });
        try {
            const data = await api.get(API_ENDPOINTS.ADDRESS.SEARCH, { params: { query } });
            if (requestId !== searchRequestRef.current || selectedRef.current) return;
            const docs = data?.documents ?? [];
            if (!Array.isArray(docs)) throw new Error('Invalid address results');
            dispatch({ type: 'SEARCH_RESULTS', results: docs });
        } catch {
            if (requestId !== searchRequestRef.current || selectedRef.current) return;
            dispatch({ type: 'SEARCH_ERROR' });
        }
    }, []);

    useEffect(() => { search(debouncedQuery); }, [debouncedQuery, search]);
    useEffect(() => () => { searchRequestRef.current += 1; }, []);

    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) dispatch({ type: 'CLOSE_DROPDOWN' });
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (state.selected && !isEditMode.current && detailRef.current) {
            setTimeout(() => detailRef.current?.focus(), 80);
        }
    }, [state.selected]);

    const handleSelect = (doc) => {
        if (!state.open || !state.results.includes(doc)) return;
        searchRequestRef.current += 1;
        selectedRef.current = true;
        skipBlurRef.current = false;
        const road     = doc?.road_address?.address_name || doc?.address?.address_name || doc?.address_name;
        const zone     = doc?.road_address?.zone_no || '';
        const building = doc?.road_address?.building_name || '';
        const lat      = Number.parseFloat(doc?.y);
        const lng      = Number.parseFloat(doc?.x);
        dispatch({ type: 'SELECT_RESULT', road, zone, building });
        isEditMode.current = false;
        emitChange(road);
        onMeta?.({ zipCode: zone, addressDetail: building, latitude: lat, longitude: lng });
    };

    const handleQueryChange = (e) => {
        const v = e.target.value;
        searchRequestRef.current += 1;
        queryRef.current = v;
        // 2026-07 재작업 — 이전엔 주소 필드에 "포커스만 해도"(커서만 올려도) 우편번호/상세주소/좌표를
        // 싹 비웠다(FOCUS_RESET_FOR_EDIT). 커서만 올렸다 뗐을 뿐인데 기존 값이 다 날아가 사용자 경험이
        // 나빴다. 이제 포커스로는 아무것도 안 지우고, 사용자가 실제로 주소를 "고치기 시작할 때"(=이미
        // 선택된 상태에서 타이핑) 그 시점에만 이전 우편번호/상세주소/좌표를 무효화한다.
        // wasSelected 플래그로 리듀서가 zipCode/detail을 함께 비우고, 여기서 부모의 메타도 비운다.
        const wasSelected = selectedRef.current;
        selectedRef.current = false;
        if (wasSelected) {
            onMeta?.({ zipCode: '', addressDetail: '', latitude: null, longitude: null });
            isEditMode.current = false;
        }
        dispatch({ type: 'QUERY_CHANGE', value: v, wasSelected });
        if (!v) onChange?.('');
    };

    // 상세주소 입력은 내부 state만 바꾸고 부모로 전파 안 되던 버그 수정 — 사용자가 직접 수정해도 form에 반영되도록 onDetailChange 호출 추가
    const handleDetailChange = (e) => {
        const v = e.target.value;
        dispatch({ type: 'DETAIL_CHANGE', value: v });
        onDetailChange?.(v);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') e.preventDefault();
        if (!state.open) return;
        if (e.key === 'ArrowDown')                     { e.preventDefault(); dispatch({ type: 'ARROW_DOWN' }); }
        else if (e.key === 'ArrowUp')                  { e.preventDefault(); dispatch({ type: 'ARROW_UP' }); }
        else if (e.key === 'Enter' && state.results.length > 0) { handleSelect(state.results[Math.max(state.activeIdx, 0)]); }
        else if (e.key === 'Escape')                  { dispatch({ type: 'CLOSE_DROPDOWN' }); }
    };

    const boxStyle = (isFocused) => ({
        display: 'flex', alignItems: 'center',
        background: colors.gray[50],
        // 공통 입력칸과 같은 포커스 — 평소에는 테두리 없이 배경색으로만 경계를 나타내고,
        // 포커스 때만 1px 중립 테두리(검색창·채팅 입력과 같은 색). 브랜드 파랑은 결과를 바꾸는
        // 행동에만 쓴다(디자인 시스템). transparent 1px 로 두어 포커스 전후 1px 밀림이 없게 한다.
        border: `1px solid ${isFocused ? colors.gray[500] : 'transparent'}`,
        borderRadius: radius.lg,
        boxSizing: 'border-box',
        padding: '0 12px', height: heights.input,
        transition: 'border-color 0.2s',
    });

    // 우편번호·상세주소 섹션 애니메이션 — 닫히는 중 / 직접 선택해 열림 / 프리필(애니메이션 없음)
    let sectionAnimation = 'none';
    if (sectionClosing) sectionAnimation = animation.slideUpOut;
    else if (state.animateSection) sectionAnimation = animation.slideUpIn;

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>

            {/* ① 도로명 주소 검색창 */}
            <div style={{ position: 'relative' }}>
                <div className="reserve-store-form-address-box" style={boxStyle(activeField === 'query')}>
                    <EnvironmentOutlined style={{ color: state.selected ? colors.primary.main : colors.text.tertiary, fontSize: 14, marginRight: 8, flexShrink: 0, transition: 'color 0.2s' }} />
                    {/* id: Form.Item label for 연결 / name: 브라우저 자동완성 식별 */}
                    <input
                        id={id}
                        name={id || 'address'}
                        className="reserve-address-input"
                        autoComplete="off"
                        aria-busy={state.loading}
                        aria-describedby={state.searchStatus === 'error' || (state.searchStatus === 'success' && state.results.length === 0) ? searchStatusId : undefined}
                        value={state.query}
                        onChange={handleQueryChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => {
                            // 2026-07 — 포커스(커서 올림)로는 절대 기존 값을 지우지 않는다. 이미 선택된 주소가
                            // 있으면 그대로 두고, 검색 결과가 남아 있을 때만 드롭다운을 다시 연다.
                            // (실제 초기화는 사용자가 주소를 직접 고치기 시작할 때 handleQueryChange에서 처리)
                            setActiveField('query');
                            if (!selectedRef.current && state.results.length > 0) {
                                dispatch({ type: 'OPEN_IF_RESULTS' });
                            }
                        }}
                        onBlur={() => {
                            setActiveField(null);
                            if (!skipBlurRef.current) dispatch({ type: 'CLOSE_DROPDOWN' });
                            skipBlurRef.current = false;
                        }}
                        placeholder={placeholder}
                        style={{
                            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                            fontSize: fontSize.lg, color: colors.text.primary,
                            fontFamily: 'inherit', cursor: 'text',
                        }}
                    />
                    {state.loading && (
                        <ArcSpinner size={14} stroke={7} color={colors.primary.main} track={colors.border.light} />
                    )}
                </div>

                {/* 드롭다운 — 닫힐 때(선택/blur/ESC)도 슬라이드 아웃 애니메이션이 재생되도록
                    useExitAnimation으로 열림/닫힘 렌더링을 분리(2026-07 버그 수정: 이전엔
                    state.open이 false가 되는 즉시 언마운트되어 여는 애니메이션만 보이고
                    닫힐 때는 애니메이션 없이 바로 사라졌음). 목록은 SELECT_RESULT 시 즉시
                    비워지는 state.results 대신, 닫히는 동안 마지막으로 유효했던 lastResults를 사용 */}
                {dropdownShouldRender && (
                    <div
                        role="listbox"
                        tabIndex={-1}
                        aria-label="주소 검색 결과"
                        onMouseDown={() => { skipBlurRef.current = true; }}
                        style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                            marginTop: 4, background: colors.background.paper,
                            border: `1px solid ${colors.border.default}`,
                            borderRadius: radius.lg,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                            overflow: 'hidden', maxHeight: 280, overflowY: 'auto',
                            animation: dropdownClosing ? animation.slideUpOut : animation.slideUpIn,
                            pointerEvents: dropdownClosing ? 'none' : undefined,
                        }}
                    >
                        {lastResults.map((doc, i) => {
                            const road  = doc.road_address?.address_name;
                            const jibun = doc.address?.address_name ?? doc.address_name;
                            const zone  = doc.road_address?.zone_no;
                            const uniqueKey = doc.road_address?.address_name ?? doc.address_name ?? String(i);
                            return (
                                <div
                                    key={uniqueKey}
                                    role="option"
                                    aria-selected={i === state.activeIdx}
                                    tabIndex={-1}
                                    onMouseDown={() => handleSelect(doc)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(doc); }}
                                    onMouseEnter={() => dispatch({ type: 'SET_ACTIVE_IDX', idx: i })}
                                    onMouseLeave={() => dispatch({ type: 'SET_ACTIVE_IDX', idx: -1 })}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                        padding: '10px 14px', cursor: 'pointer',
                                        background: i === state.activeIdx ? colors.gray[50] : colors.background.paper,
                                        borderBottom: i < lastResults.length - 1 ? `1px solid ${colors.border.light}` : 'none',
                                    }}
                                >
                                    <EnvironmentOutlined style={{ color: colors.primary.main, marginTop: 3, flexShrink: 0, fontSize: 13 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: fontSize.sm, color: colors.text.primary, fontWeight: 500 }}>
                                                {road || jibun}
                                            </span>
                                            {zone && (
                                                <span style={{ fontSize: 11, color: colors.text.tertiary, flexShrink: 0 }}>
                                                    {zone}
                                                </span>
                                            )}
                                        </div>
                                        {road && jibun && (
                                            <div style={{ fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2 }}>
                                                지번 {jibun}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {state.searchStatus === 'error' && (
                <DataState id={searchStatusId} state="error" title="주소 검색에 실패했어요."
                    onRetry={() => search(state.query)} compact />
            )}
            {state.searchStatus === 'success' && state.results.length === 0 && (
                <p id={searchStatusId} role="status" style={{ margin: 0, fontSize: fontSize.sm, color: colors.text.tertiary }}>검색 결과가 없어요. 도로명이나 지번을 확인해 주세요.</p>
            )}

            {/* ② 선택 후 — 우편번호 + 상세주소. 사용자가 드롭다운에서 직접 선택했을 때만
                slideUpIn으로 등장하고, 마이페이지 초기 프리필(이미 있던 주소)에서는 애니메이션 없이 바로 보인다. */}
            {sectionShouldRender && (
                <div style={{
                    display: 'flex', gap: 8, minWidth: 0, width: '100%',
                    animation: sectionAnimation,
                }}>
                    {section.zipCode && (
                        // 우편번호: readOnly → div 기반 터치 스크롤 컨테이너
                        <div className="reserve-store-form-address-box" style={{ ...boxStyle(false), width: 82, flexShrink: 0, cursor: 'default', overflow: 'hidden' }}>
                            <div style={{
                                width: '100%',
                                overflowX: 'auto', whiteSpace: 'nowrap', scrollbarWidth: 'none',
                                msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch',
                                fontSize: fontSize.lg,
                                color: colors.text.primary,
                                fontFamily: 'inherit', userSelect: 'none', textAlign: 'center',
                            }}>
                                {section.zipCode}
                            </div>
                        </div>
                    )}
                    {/* 상세주소: 터치 드래그로 스크롤 — onTouchStart/Move로 scrollLeft 조작 */}
                    <div
                        className="reserve-store-form-address-box"
                        style={{ ...boxStyle(activeField === 'detail'), flex: 1, minWidth: 0, overflow: 'hidden', touchAction: 'pan-y' }}
                        onTouchStart={(e) => {
                            touchState.current.startX = e.touches[0].clientX;
                            touchState.current.scrollStart = detailRef.current?.scrollLeft || 0;
                        }}
                        onTouchMove={(e) => {
                            if (!detailRef.current || touchState.current.startX == null) return;
                            const dx = touchState.current.startX - e.touches[0].clientX;
                            detailRef.current.scrollLeft = (touchState.current.scrollStart ?? 0) + dx;
                        }}
                    >
                        <input
                            ref={detailRef}
                            className="reserve-address-input"
                            autoComplete="off"
                            value={section.detail}
                            onChange={handleDetailChange}
                            onFocus={() => setActiveField('detail')}
                            onBlur={() => setActiveField(null)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                            placeholder="상세주소 (동, 호수 등)"
                            style={{
                                flex: 1, minWidth: 0, width: '100%', border: 'none', outline: 'none', background: 'transparent',
                                fontSize: fontSize.lg, color: colors.text.primary, fontFamily: 'inherit',
                                overflowX: 'auto', whiteSpace: 'nowrap',
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

AddressSearch.propTypes = {
    id:             PropTypes.string,
    value:          PropTypes.string,
    zipCode:        PropTypes.string,
    addressDetail:  PropTypes.string,
    onChange:       PropTypes.func,
    onMeta:         PropTypes.func,
    onDetailChange: PropTypes.func,
    placeholder:    PropTypes.string,
};

export default AddressSearch;
