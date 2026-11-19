import { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Input } from 'antd';
import { CloseCircleFilled, SearchOutlined } from './icons';

/* 미확정 입력은 조회 조건에 넣지 않고 같은 입력 DOM과 포커스를 유지한다. */
export default function ListSearchField({ value = '', onSubmit, onChange, placeholder = '검색', disabled = false, maxLength = 100 }) {
    const [input, setInput] = useState({ applied: value, draft: value });
    const composing = useRef(false);
    const submitted = useRef(value);
    useLayoutEffect(() => { submitted.current = value; }, [value]);
    const confirmed = typeof onSubmit === 'function';
    if (input.applied !== value) {
        setInput({ applied: value, draft: value });
    }
    const draft = confirmed ? input.draft : value;
    const submit = next => {
        if (disabled || composing.current) return;
        const term = next.trim();
        setInput({ applied: value, draft: term });
        if (term === submitted.current.trim()) return;
        submitted.current = term;
        onSubmit?.(term);
    };
    return <form className="reserve-list-search" role="search"
        aria-label={placeholder} onSubmit={event => { event.preventDefault(); if (confirmed) submit(draft); }}>
        <Input type="search" value={draft} placeholder={placeholder} aria-label={placeholder} disabled={disabled}
            maxLength={maxLength} enterKeyHint="search" autoComplete="off"
            prefix={confirmed ? <button type="submit" className="reserve-search-icon" aria-label="검색" disabled={disabled}>
                <SearchOutlined aria-hidden="true" /></button> : <SearchOutlined aria-hidden="true" />}
            onChange={event => {
                if (confirmed) setInput({ applied: value, draft: event.target.value });
                else onChange?.(event);
            }}
            onClear={() => { if (confirmed) submit(''); }}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={event => {
                if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
                if (event.key === 'Escape' && confirmed && !composing.current && !event.nativeEvent.isComposing) {
                    event.preventDefault(); event.stopPropagation(); setInput({ applied: value, draft: value });
                }
            }} allowClear={{ clearIcon: <CloseCircleFilled aria-label="검색어 지우기" /> }} size="large" />
    </form>;
}

ListSearchField.propTypes = {
    value: PropTypes.string, onSubmit: PropTypes.func, onChange: PropTypes.func, placeholder: PropTypes.string,
    disabled: PropTypes.bool, maxLength: PropTypes.number,
};
