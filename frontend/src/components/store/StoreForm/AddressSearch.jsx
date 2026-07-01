import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { EnvironmentOutlined } from '@ant-design/icons';
import api from '../../../api/axios';
import useDebounce from '../../../hooks/useDebounce';
import { colors, fontSize, radius } from '../../../styles/tokens';
import { animation } from '../../../styles/tokens/animations';

// id prop: Form.Item이 label for 연결을 위해 주입 — 메인 input에 전달
const AddressSearch = ({ id, value = '', zipCode: zipCodeProp = '', addressDetail: addressDetailProp = '', onChange, onMeta, placeholder = '도로명 또는 지번 주소를 검색하세요' }) => {
    const [query, setQuery]         = useState('');
    const [detail, setDetail]       = useState('');
    const [zipCode, setZipCode]     = useState('');
    const [selected, setSelected]   = useState(false);
    const [results, setResults]     = useState([]);
    const [open, setOpen]           = useState(false);
    const [loading, setLoading]     = useState(false);
    const [focused, setFocused]     = useState(false);
    const [detailFocused, setDetailFocused] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);

    const containerRef   = useRef(null);
    const skipBlurRef    = useRef(false);
    const detailRef      = useRef(null);
    const isEditMode     = useRef(false);
    const selectedRef    = useRef(false);
    const touchState     = useRef({ startX: 0, scrollStart: 0 });
    const debouncedQuery = useDebounce(query, 400);

    const setSelectedBoth = (val) => { setSelected(val); selectedRef.current = val; };

    useEffect(() => {
        if (value?.trim()) {
            setQuery(value.trim());
            setSelectedBoth(true);
            isEditMode.current = true;
        } else {
            setQuery('');
            setDetail('');
            setZipCode('');
            setSelectedBoth(false);
            isEditMode.current = false;
        }
    }, [value]);

    useEffect(() => { if (zipCodeProp)       setZipCode(zipCodeProp); },       [zipCodeProp]);
    useEffect(() => { if (addressDetailProp) setDetail(addressDetailProp); }, [addressDetailProp]);

    const emitChange = useCallback((road) => { onChange?.(road); }, [onChange]);

    const search = useCallback(async (q) => {
        if (!q || q.trim().length < 3 || selectedRef.current) {
            if (!selectedRef.current) { setResults([]); setOpen(false); }
            return;
        }
        setLoading(true);
        try {
            const data = await api.get('/api/address/search', { params: { query: q.trim() } });
            const docs = data?.documents ?? [];
            setResults(docs);
            setOpen(docs.length > 0);
            setActiveIdx(-1);
        } catch {
            setResults([]); setOpen(false);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { search(debouncedQuery); }, [debouncedQuery, search]);

    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (selected && !isEditMode.current && detailRef.current) {
            setTimeout(() => detailRef.current?.focus(), 80);
        }
    }, [selected]);

    const handleSelect = (doc) => {
        skipBlurRef.current = false;
        const road     = doc?.road_address?.address_name || doc?.address?.address_name || doc?.address_name;
        const zone     = doc?.road_address?.zone_no || '';
        const building = doc?.road_address?.building_name || '';
        const lat      = Number.parseFloat(doc?.y);
        const lng      = Number.parseFloat(doc?.x);
        setQuery(road);
        setZipCode(zone);
        setDetail(building);
        setSelectedBoth(true);
        setResults([]);
        setOpen(false);
        isEditMode.current = false;
        emitChange(road);
        onMeta?.({ zipCode: zone, addressDetail: building, latitude: lat, longitude: lng });
    };

    const handleQueryChange = (e) => {
        const v = e.target.value;
        setQuery(v);
        setSelectedBoth(false);
        if (!v) { setResults([]); setOpen(false); onChange?.(''); }
    };

    const handleDetailChange = (e) => { setDetail(e.target.value); };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') e.preventDefault();
        if (!open) return;
        if (e.key === 'ArrowDown')                     { e.preventDefault(); setActiveIdx(i => (i < results.length - 1 ? i + 1 : i)); }
        else if (e.key === 'ArrowUp')                  { e.preventDefault(); setActiveIdx(i => (i > 0 ? i - 1 : -1)); }
        else if (e.key === 'Enter' && activeIdx >= 0) { handleSelect(results[activeIdx]); }
        else if (e.key === 'Escape')                  { setOpen(false); }
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
                <div style={boxStyle(focused)}>
                    <EnvironmentOutlined style={{ color: selected ? colors.primary.main : colors.text.tertiary, fontSize: 14, marginRight: 8, flexShrink: 0, transition: 'color 0.2s' }} />
                    {/* id: Form.Item label for 연결 / name: 브라우저 자동완성 식별 */}
                    <input
                        id={id}
                        name={id || 'address'}
                        autoComplete="off"
                        value={query}
                        onChange={handleQueryChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => {
                            setFocused(true);
                            if (selectedRef.current) {
                                setSelectedBoth(false);
                                setQuery('');
                                setResults([]);
                                setOpen(false);
                                isEditMode.current = false;
                            } else if (results.length > 0) {
                                setOpen(true);
                            }
                        }}
                        onBlur={() => {
                            setFocused(false);
                            if (!skipBlurRef.current) setOpen(false);
                            skipBlurRef.current = false;
                        }}
                        placeholder={placeholder}
                        style={{
                            flex: 1, border: 'none', outline: 'none', background: 'transparent',
                            fontSize: fontSize.base, color: colors.text.primary,
                            fontFamily: 'inherit', cursor: 'text',
                        }}
                    />
                    {loading && (
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
                {open && results.length > 0 && (
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
                        {results.map((doc, i) => {
                            const road  = doc.road_address?.address_name;
                            const jibun = doc.address?.address_name ?? doc.address_name;
                            const zone  = doc.road_address?.zone_no;
                            const uniqueKey = doc.road_address?.address_name ?? doc.address_name ?? String(i);
                            return (
                                <div
                                    key={uniqueKey}
                                    role="option"
                                    aria-selected={i === activeIdx}
                                    tabIndex={-1}
                                    onMouseDown={() => handleSelect(doc)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(doc); }}
                                    onMouseEnter={() => setActiveIdx(i)}
                                    onMouseLeave={() => setActiveIdx(-1)}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                        padding: '10px 14px', cursor: 'pointer',
                                        background: i === activeIdx ? colors.gray[50] : '#fff',
                                        borderBottom: i < results.length - 1 ? `1px solid ${colors.border.light}` : 'none',
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
            {(selected || zipCode) && (
                <div style={{ display: 'flex', gap: 8, minWidth: 0, width: '100%', animation: animation.slideUpIn }}>
                    {zipCode && (
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
                                {zipCode}
                            </div>
                        </div>
                    )}
                    {/* 상세주소: 터치 드래그로 스크롤 — onTouchStart/Move로 scrollLeft 조작 */}
                    <div
                        style={{ ...boxStyle(detailFocused), flex: 1, minWidth: 0, overflow: 'hidden', touchAction: 'pan-y' }}
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
                            value={detail}
                            onChange={handleDetailChange}
                            onFocus={() => setDetailFocused(true)}
                            onBlur={() => setDetailFocused(false)}
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
