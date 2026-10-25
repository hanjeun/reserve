/**
 * 여러 줄의 선택지를 고정 열 수의 그리드로 배치한다.
 * flex-wrap에 따른 줄별 개수·폭 차이를 피하고 SegmentedControl과 선택 상태의 모양을 공유한다.
 */
import React from 'react';
import PropTypes from 'prop-types';

const SegmentedGrid = ({ options, value, onChange, columns = 4, disabled = false }) => (
    <div
        className="reserve-segmented"
        style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: 4,
            width: '100%',
        }}
        role="radiogroup"
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
                    // --wrap 은 세로 패딩을 키운다. 여러 줄 모드는 라벨이 짧은 경우가 많아
                    // (문의 유형의 "예약"·"결제") 내용 폭만으로는 손가락으로 누르기 어렵다.
                    className={`reserve-segmented-btn reserve-segmented-btn--wrap${active ? ' reserve-segmented-btn--active' : ''}`}
                    // 폭은 그리드 칸이 정한다 — flex 계산을 넣으면 오히려 충돌한다.
                >
                    {opt.label}
                </button>
            );
        })}
    </div>
);

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
    disabled: PropTypes.bool,
};

export default SegmentedGrid;
