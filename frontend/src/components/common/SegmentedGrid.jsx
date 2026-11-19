/**
 * 여러 줄의 선택지를 고정 열 수의 그리드로 배치한다.
 * flex-wrap에 따른 줄별 개수·폭 차이를 피하고 SegmentedControl과 선택 상태의 모양을 공유한다.
 */
import React from 'react';
import PropTypes from 'prop-types';
import useRadioGroupNavigation from '../../hooks/useRadioGroupNavigation';

const SegmentedGrid = ({ options, value, onChange, columns = 4, gap = 4, disabled = false, id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }) => {
    const radioProps = useRadioGroupNavigation({ options, value, onChange, disabled });
    return (
    <div
        id={id}
        className="reserve-segmented"
        style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap,
            width: '100%',
        }}
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
                    // 짧은 라벨도 충분한 터치 영역을 갖도록 그리드용 여백을 사용한다.
                    className={`reserve-segmented-btn reserve-segmented-btn--wrap${active ? ' reserve-segmented-btn--active' : ''}`}
                >
                    {opt.label}
                </button>
            );
        })}
    </div>
    );
};

SegmentedGrid.propTypes = {
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        label: PropTypes.node.isRequired,
        disabled: PropTypes.bool,
    })).isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onChange: PropTypes.func.isRequired,
    /** 줄당 버튼 개수. 항목 수를 이 값의 배수로 두면 줄 끝이 비지 않는다. */
    columns: PropTypes.number,
    gap: PropTypes.number,
    disabled: PropTypes.bool,
    id: PropTypes.string,
    'aria-label': PropTypes.string,
    'aria-labelledby': PropTypes.string,
};

export default SegmentedGrid;
