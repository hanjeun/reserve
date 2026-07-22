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
                    style={
                        // 2026-07 버그 수정: wrap 모드에서 flex:1을 쓰면, 줄이 바뀌어 혼자 남은 마지막
                        // 버튼(예: 문의하기 모달 "기타 문의")이 해당 줄을 혼자 차지하면서 전체 폭으로 늘어나는
                        // 문제가 있었다(flex-grow:1이 경쟁자 없이 혼자면 100% 차지). wrap일 때는 내용만큼만
                        // 차지하게(flex-grow 없음) 바꿔, 혼자 남아도 늘어나지 않고 자연스럽게 줄바꿈되게 함.
                        wrap ? { flex: '0 0 auto' } : (block ? { flex: 1 } : undefined)
                    }
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
