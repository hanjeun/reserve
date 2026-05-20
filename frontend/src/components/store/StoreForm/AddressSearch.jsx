import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EnvironmentOutlined } from '@ant-design/icons';
import api from '../../../api/axios';
import useDebounce from '../../../hooks/useDebounce';
import { colors, fontSize, radius } from '../../../styles/tokens';
import { animation } from '../../../styles/tokens/animations';

const AddressSearch = ({ value = '', zipCode: zipCodeProp = '', addressDetail: addressDetailProp = '', onChange, onMeta, placeholder = '도로명 또는 지번 주소를 검색하세요' }) => {
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
    // selected를 ref로도 관리 → search 콜백이 stale closure 없이 참조 가능
    const selectedRef    = useRef(false);
    const debouncedQuery = useDebounce(query, 400);

    const setSelectedBoth = (val) => { setSelected(val); selectedRef.current = val; };

    // 외부 value 동기화 — 수정 모드에서 기존 주소 복원
    useEffect(() => {
        if (value && value.trim()) {
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

    // selected를 ref로 읽어서 deps에서 제거 → 불필요한 재생성 방지
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
    }, []); // deps 없음 — selectedRef.current으로 읽으므로 stale 없음

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
        const road     = doc.road_address?.address_name || doc.address?.address_name || doc.address_name;
        const zone     = doc.road_address?.zone_no || '';
        const building = doc.road_address?.building_name || '';
        const lat      = Number.parseFloat(doc.y);
        const lng      = Number.parseFloat(doc.x);
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
        if (e.key === 'ArrowDown')                    { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp')                 { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' && activeIdx >= 0) { handleSelect(results[activeIdx]); }
        else if (e.key === 'Escape')                  { setOpen(false); }
    };

    const boxStyle = (isFocused) => ({
        display: 'flex', alignItems: 'center',
        background: colors.gray[50],
        border: `1px solid ${isFocused ? colors.primary.main : colors.border.default}`,
        borderRadius: radius.lg,
        padding: '0 12px', height: 44,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: isFocused ? `0 0 0 2px ${colors.primary.main}18` : 'none',
    });

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* ① 도로명 주소 검색창 */}
            <div style={{ position: 'relative' }}>
                <div style={boxStyle(focused)}>
                    <EnvironmentOutlined style={{ color: colors.text.tertiary, fontSize: 14, marginRight: 8, flexShrink: 0 }} />
                    <input
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
                                    onMouseEnter={() => setActiveIdx(i)}
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
                <div style={{ display: 'flex', gap: 8, animation: animation.slideUpIn }}>
                    {zipCode && (
                        <div style={{ ...boxStyle(false), width: 84, flexShrink: 0, cursor: 'default' }}>
                            <input
                                readOnly tabIndex={-1} value={zipCode}
                                style={{
                                    width: '100%', border: 'none', outline: 'none', background: 'transparent',
                                    fontSize: fontSize.sm, color: colors.text.tertiary,
                                    fontFamily: 'inherit', cursor: 'default', textAlign: 'center',
                                }}
                            />
                        </div>
                    )}
                    <div style={{ ...boxStyle(detailFocused), flex: 1 }}>
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
                                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                                fontSize: fontSize.base, color: colors.text.primary, fontFamily: 'inherit',
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AddressSearch;
