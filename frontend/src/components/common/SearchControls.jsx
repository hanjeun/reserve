import { useRef } from 'react';
import PropTypes from 'prop-types';
import { CloseCircleFilled, SearchOutlined } from './icons';

export default function SearchControls({ value, onChange, onCancel, onSubmit, inputRef, label, placeholder,
    maxLength, autoFocus = false, composing = false, onCompositionStart, onCompositionEnd }) {
    const localInputRef = useRef(null);
    const fieldRef = inputRef ?? localInputRef;
    const clear = () => {
        onChange('');
        fieldRef.current?.focus();
    };

    return <>
        <form className="reserve-search-field" role="search" onSubmit={event => {
            event.preventDefault();
            if (composing) return;
            if (onSubmit) onSubmit(value);
            else fieldRef.current?.focus();
        }}>
            <button type="submit" className="reserve-search-icon" aria-label="검색">
                <SearchOutlined aria-hidden="true" />
            </button>
            <input ref={fieldRef} type="search" aria-label={label} placeholder={placeholder} maxLength={maxLength}
                autoFocus={autoFocus} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search"
                value={value} onChange={event => onChange(event.target.value)}
                onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd}
                onKeyDown={event => {
                    if (event.key === 'Enter' && (composing || event.nativeEvent.isComposing || event.keyCode === 229)) {
                        event.preventDefault();
                        return;
                    }
                    if (event.key === 'Escape' && !composing && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        event.stopPropagation();
                        onCancel();
                    }
                }} />
            {value && <button type="button" className="reserve-search-clear" aria-label="검색어 지우기" onClick={clear}>
                <CloseCircleFilled aria-hidden="true" />
            </button>}
        </form>
        <button type="button" className="reserve-search-cancel" onClick={onCancel}>취소</button>
    </>;
}

SearchControls.propTypes = {
    value: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    onSubmit: PropTypes.func,
    inputRef: PropTypes.shape({ current: PropTypes.any }),
    label: PropTypes.string.isRequired,
    placeholder: PropTypes.string.isRequired,
    maxLength: PropTypes.number,
    autoFocus: PropTypes.bool,
    composing: PropTypes.bool,
    onCompositionStart: PropTypes.func,
    onCompositionEnd: PropTypes.func,
};
