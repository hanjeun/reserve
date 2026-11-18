/*
 * 한 줄의 적은 선택지에 사용하고 여러 줄·검색 선택과 구분한다.
 */
import React from 'react';
import PropTypes from 'prop-types';
import useRadioGroupNavigation from '../../hooks/useRadioGroupNavigation';

const SegmentedControl = ({ options, value, onChange, block = true, disabled = false, id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }) => {
    const radioProps = useRadioGroupNavigation({ options, value, onChange, disabled });
    return (
    <div
        id={id}
        className="reserve-segmented"
        // 여러 줄 선택지는 열 수를 고정하는 SegmentedGrid를 사용한다.
        style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, width: block ? '100%' : undefined }}
        role="radiogroup"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-disabled={disabled || undefined}
    >
        {options.map((opt, index) => {
            const active = opt.value === value;
            return (
                <button
                    key={opt.value}
                    {...radioProps(index)}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled || opt.disabled}
                    onClick={() => onChange(opt.value)}
                    className={`reserve-segmented-btn${active ? ' reserve-segmented-btn--active' : ''}`}
                    style={block ? { flex: 1 } : undefined}
                >
                    {opt.label}
                </button>
            );
        })}
    </div>
    );
};

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
