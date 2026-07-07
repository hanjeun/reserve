/**
 * RESERVE Design System - SegmentedControl Component
 *
 * 소수의 선택지(2~5개 정도) 중 하나를 고르는 용도 — 드롭다운(FormSelect)이 아니라
 * 탭/페이지네이션과 동일한 "회색 트랙 + 선택 시 진한 배경" 톤으로 통일.
 * 옵션이 많거나(수십 개) 검색이 필요한 경우엔 FormSelect를 그대로 쓸 것 — 이 컴포넌트는
 * "한눈에 다 보이는 소수 선택"에만 사용.
 *
 * 사용법:
 * <SegmentedControl
 *   value={adType}
 *   onChange={setAdType}
 *   options={[{ value: 'BADGE', label: '배지형 (1,000원/일)' }, { value: 'BANNER', label: '배너형 (5,000원/일)' }]}
 * />
 */
import React from 'react';
import PropTypes from 'prop-types';

const SegmentedControl = ({ options, value, onChange, block = true, wrap = false, disabled = false }) => (
    <div
        className="reserve-segmented"
        style={{
            display: 'flex',
            flexWrap: wrap ? 'wrap' : 'nowrap',
            gap: 4,
            width: block ? '100%' : undefined,
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
                    className={`reserve-segmented-btn${active ? ' reserve-segmented-btn--active' : ''}`}
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
    block: PropTypes.bool,
    wrap: PropTypes.bool,
    disabled: PropTypes.bool,
};

export default SegmentedControl;
