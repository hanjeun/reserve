import React, { useReducer, useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { EnvironmentOutlined } from '@ant-design/icons';
import api from '../../../api/axios';
import useDebounce from '../../../hooks/useDebounce';
import { colors, fontSize, radius } from '../../../styles/tokens';
import { animation } from '../../../styles/tokens/animations';

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
    activeIdx: -1,
};

function reducer(state, action) {
    switch (action.type) {
        case 'RESET_FOR_VALUE':
            return { ...state, query: action.query, selected: true };
        case 'CLEAR_ALL':
            return { ...state, query: '', detail: '', zipCode: '', selected: false };
        case 'SET_ZIPCODE':
            return { ...state, zipCode: action.zipCode };
        case 'SET_DETAIL_VALUE':
            return { ...state, detail: action.detail };
        case 'SEARCH_LOADING':
            return { ...state, loading: true };
        case 'SEARCH_RESULTS':
            return { ...state, results: action.results, open: action.results.length > 0, activeIdx: -1, loading: false };
        case 'SEARCH_EMPTY':
        case 'SEARCH_ERROR':
            return { ...state, results: [], open: false, loading: false };
        case 'QUERY_CHANGE':
            return {
                ...state,
                query: action.value,
                selected: false,
                ...(action.value === '' ? { results: [], open: false } : {}),
            };
        case 'DETAIL_CHANGE':
            return { ...state, detail: action.value };
        case 'SELECT_RESULT':
            return {
                ...state,
                query: action.road, zipCode: action.zone, detail: action.building,
                selected: true, results: [], open: false, activeIdx: -1,
            };
        case 'CLOSE_DROPDOWN':
            return { ...state, open: false };
        case 'FOCUS_RESET_FOR_EDIT':
            return { ...state, selected: false, query: '', results: [], open: false };
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
const AddressSearch = ({ id, value = '', zipCode: zipCodeProp = '', addressDetail: addressDetailProp = '', onChange, onMeta, placeholder = '도로명 또는 지번 주소를 검색하세요' }) => {
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
    const touchState     = useRef({ startX: 0, scrollStart: 0 });
    const debouncedQuery = useDebounce(state.query, 400);

    useEffect(() => { selectedRef.current = state.selected; }, [state.selected]);

    useEffect(() => {
        if (value?.trim()) {
            dispatch({ type: 'RESET_FOR_VALUE', query: value.trim() });
            isEditMode.current = true;
        } else {
            dispatch({ type: 'CLEAR_ALL' });
            isEditMode.current = false;
        }
    }, [value]);

    useEffect(() => { if (zipCodeProp)       dispatch({ type: 'SET_ZIPCODE', zipCode: zipCodeProp }); },       [zipCodeProp]);
    useEffect(() => { if (addressDetailProp) dispatch({ type: 'SET_DETAIL_VALUE', detail: addressDetailProp }); }, [addressDetailProp]);

    const emitChange = useCallback((road) => { onChange?.(road); }, [onChange]);

    const search = useCallback(async (q) => {
        if (!q || q.trim().length < 3 || selectedRef.current) {
            if (!selectedRef.current) dispatch({ type: 'SEARCH_EMPTY' });
            return;
        }
        dispatch({ type: 'SEARCH_LOADING' });
        try {
            const data = await api.get('/api/address/search', { params: { query: q.trim() } });
            const docs = data?.documents ?? [];
            dispatch({ type: 'SEARCH_RESULTS', results: docs });
        } catch {
            dispatch({ type: 'SEARCH_ERROR' });
        }
    }, []);

    useEffect(() => { search(debouncedQuery); }, [debouncedQuery, search]);

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
        dispatch({ type: 'QUERY_CHANGE', value: v });
        if (!v) onChange?.('');
    };

    const handleDetailChange = (e) => { dispatch({ type: 'DETAIL_CHANGE', value: e.target.value }); };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') e.preventDefault();
        if (!state.open) return;
        if (e.key === 'ArrowDown')                     { e.preventDefault(); dispatch({ type: 'ARROW_DOWN' }); }
        else if (e.key === 'ArrowUp')                  { e.preventDefault(); dispatch({ type: 'ARROW_UP' }); }
        else if (e.key === 'Enter' && state.activeIdx >= 0) { handleSelect(state.results[state.activeIdx]); }
        else if (e.key === 'Escape')                  { dispatch({ type: 'CLOSE_DROPDOWN' }); }
    };

    const boxStyle = (isFocused) => ({
        display: 'flex', alignItems: 'center',
        background: colors.gray[50],
        border: `1px solid ${isFocused ? colors.primary.main : colors.border.default}`,
        borderRadius: radius.lg,
        boxSizing: 'border-box',
        padding: '0 12px', height: 44,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: isFocused ? `0 0 0 2px ${colors.primary.main}18` : 'none',
    });

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>

            {/* ① 도로명 주소 검색창 */}
            <div style={{ position: 'relative' }}>
                <div style={boxStyle(activeField === 'query')}>
                    <EnvironmentOutlined style={{ color: state.selected ? colors.primary.main : colors.text.tertiary, fontSize: 14, marginRight: 8, flexShrink: 0, transition: 'color 0.2s' }} />
                    {/* id: Form.Item label for 연결 / name: 브라우저 자동완성 식별 */}
                    <input
                        id={id}
                        name={id || 'address'}
                        autoComplete="off"
                        value={state.query}
                        onChange={handleQueryChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => {
                            setActiveField('query');
                            if (selectedRef.current) {
                                dispatch({ type: 'FOCUS_RESET_FOR_EDIT' });
                                isEditMode.current = false;
                            } else if (state.results.length > 0) {
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
                            flex: 1, border: 'none', outline: 'none', background: 'transparent',
                            fontSize: fontSize.base, color: colors.text.primary,
                            fontFamily: 'inherit', cursor: 'text',
                        }}
                    />
                    {state.loading && (
                        <div style={{
                            width: 14, height: 14, flexShrink: 0,
                            border: `2px solid ${colors.border.light}`,
                            borderTopColor: colors.primary.main,
                            borderRadius: '50%',
                            animation: 'reserve-spin 0.6s linear infinite',
                        }} />
                    )}
                </div>

                {/* 드롭다운 */}
                {state.open && state.results.length > 0 && (
                    <div
                        role="listbox"
                        tabIndex={-1}
                        aria-label="주소 검색 결과"
                        onMouseDown={() => { skipBlurRef.current = true; }}
                        style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                            marginTop: 4, background: '#fff',
                            border: `1px solid ${colors.border.default}`,
                            borderRadius: radius.lg,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                            overflow: 'hidden', maxHeight: 280, overflowY: 'auto',
                            animation: animation.slideUpIn,
                        }}
                    >
                        {state.results.map((doc, i) => {
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
                                        background: i === state.activeIdx ? colors.gray[50] : '#fff',
                                        borderBottom: i < state.results.length - 1 ? `1px solid ${colors.border.light}` : 'none',
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

            {/* ② 선택 후 — 우편번호 + 상세주소 */}
            {(state.selected || state.zipCode) && (
                <div style={{ display: 'flex', gap: 8, minWidth: 0, width: '100%', animation: animation.slideUpIn }}>
                    {state.zipCode && (
                        // 우편번호: readOnly → div 기반 터치 스크롤 컨테이너
                        <div style={{ ...boxStyle(false), width: 76, flexShrink: 0, cursor: 'default', overflow: 'hidden' }}>
                            <div style={{
                                width: '100%',
                                overflowX: 'auto', whiteSpace: 'nowrap', scrollbarWidth: 'none',
                                msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch',
                                fontSize: fontSize.base,
                                color: colors.text.primary,
                                fontFamily: 'inherit', userSelect: 'none', textAlign: 'center',
                            }}>
                                {state.zipCode}
                            </div>
                        </div>
                    )}
                    {/* 상세주소: 터치 드래그로 스크롤 — onTouchStart/Move로 scrollLeft 조작 */}
                    <div
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
                            autoComplete="off"
                            value={state.detail}
                            onChange={handleDetailChange}
                            onFocus={() => setActiveField('detail')}
                            onBlur={() => setActiveField(null)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                            placeholder="상세주소 (동, 호수 등)"
                            style={{
                                flex: 1, minWidth: 0, width: '100%', border: 'none', outline: 'none', background: 'transparent',
                                fontSize: fontSize.base, color: colors.text.primary, fontFamily: 'inherit',
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
    id:            PropTypes.string,
    value:         PropTypes.string,
    zipCode:       PropTypes.string,
    addressDetail: PropTypes.string,
    onChange:      PropTypes.func,
    onMeta:        PropTypes.func,
    placeholder:   PropTypes.string,
};

export default AddressSearch;
