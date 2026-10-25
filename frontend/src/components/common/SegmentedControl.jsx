/*
 * 한 줄의 적은 선택지에 사용하고 여러 줄·검색 선택과 구분한다.
 */
import React from 'react';
import PropTypes from 'prop-types';

const SegmentedControl = ({ options, value, onChange, block = true, disabled = false, id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }) => (
    <div
        id={id}
        className="reserve-segmented"
        // nowrap 이다 — 줄바꿈이 필요하면 SegmentedGrid 를 쓴다.
        // flex-wrap 은 왼쪽부터 채우기 때문에 줄당 개수를 제어할 수 없고, 그게 5+3 사태의 원인이었다.
        style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, width: block ? '100%' : undefined }}
        role="radiogroup"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
    >
        {options.map((opt) => {
            const active = opt.value === value;
            return (
                <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled || opt.disabled}
                    onClick={() => onChange(opt.value)}
                    className={`reserve-segmented-btn${active ? ' reserve-segmented-btn--active' : ''}`}
                    // block 이면 버튼들이 트랙을 균등하게 나눠 갖는다. 아니면 내용 폭만 차지한다.
                    style={block ? { flex: 1 } : undefined}
                >
                    {opt.label}
                </button>
            );
        })}
    </div>
);

SegmentedControl.propTypes = {
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        label: PropTypes.node.isRequired,
        disabled: PropTypes.bool,
    })).isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onChange: PropTypes.func.isRequired,
    /** true(기본)면 트랙 전체 폭을 균등 분할. false 면 내용 폭만 차지한다. */
    block: PropTypes.bool,
    disabled: PropTypes.bool,
    id: PropTypes.string,
    'aria-label': PropTypes.string,
    'aria-labelledby': PropTypes.string,
};

export default SegmentedControl;
