import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';

const COPY_FEEDBACK_MS = 1600;

const copyText = async (text) => {
    try {
        if (globalThis.navigator?.clipboard?.writeText) {
            await globalThis.navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // 권한이 막힌 브라우저는 아래의 기존 document 복사 방식으로 한 번 더 시도한다.
    }

    if (typeof document === 'undefined' || !document.body || !document.execCommand) return false;

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
};

/** 코드·주문번호처럼 복사가 필요한 값을 같은 아이콘·안내 문구로 표시한다. */
const CopyableText = ({ value, label = '내용', fallback = '-', className = '', style, ...spanProps }) => {
    const text = value == null ? '' : String(value);
    const hasText = Boolean(text.trim());
    const [copied, setCopied] = useState(false);
    const resetTimerRef = useRef(null);

    useEffect(() => () => {
        if (resetTimerRef.current) globalThis.clearTimeout(resetTimerRef.current);
    }, []);

    const handleCopy = async () => {
        if (!hasText || !await copyText(text)) return;

        setCopied(true);
        if (resetTimerRef.current) globalThis.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = globalThis.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    };

    return (
        <span {...spanProps} className={className ? `reserve-copyable-text ${className}` : 'reserve-copyable-text'} style={style}>
            <span className="reserve-copyable-text__value">{hasText ? text : fallback}</span>
            {hasText && (
                <button
                    className="reserve-copyable-text__button"
                    type="button"
                    aria-label={`${label} ${copied ? '복사됨' : '복사'}`}
                    title={`${label} ${copied ? '복사됨' : '복사'}`}
                    onClick={handleCopy}
                >
                    {copied ? <CheckOutlined aria-hidden="true" /> : <CopyOutlined aria-hidden="true" />}
                </button>
            )}
            <output className="reserve-copyable-text__status">
                {copied ? `${label}를 복사했습니다.` : ''}
            </output>
        </span>
    );
};

CopyableText.propTypes = {
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    label: PropTypes.string,
    fallback: PropTypes.node,
    className: PropTypes.string,
    style: PropTypes.object,
};

export default CopyableText;
