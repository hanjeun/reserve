/**
 * RESERVE Design System - SegmentedControl
 *
 * 소수의 선택지(2~5개) 중 하나를 고르는 **한 줄 컨트롤**. 드롭다운(FormSelect)이 아니라
 * 탭·페이지네이션과 같은 "회색 트랙 + 선택 시 진한 배경" 톤이다.
 * 옵션이 수십 개거나 검색이 필요하면 FormSelect 를 쓸 것 — 이건 "한눈에 다 보이는 소수 선택"용이다.
 *
 * 사용법:
 *   <SegmentedControl value={adType} onChange={setAdType} options={AD_TYPE_OPTIONS} />
 *   <SegmentedControl value={range} onChange={setRange} options={RANGE_OPTIONS} block={false} />
 *
 * ┌─ 어느 쪽을 써야 하나 ────────────────────────────────────────────────┐
 * │ SegmentedControl … 한 줄에 다 들어가는 소수 선택 (2~5개)              │
 * │ SegmentedGrid    … 항목이 많아 여러 줄이 필요한 선택 (문의 유형 8개)   │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * ★ 2026-08-06 분할 — 예전에는 이 컴포넌트가 `wrap` / `block` / `columns` 세 갈래를 다 갖고 있었다.
 *   prop 이 늘어날수록 조합이 폭발하고, 한 조합을 고치면 다른 조합이 깨진다(실제로 그랬다:
 *   flex-wrap 모드에서 혼자 남은 마지막 버튼이 줄 전체를 차지하는 버그, 그리고 데스크톱에서
 *   8개가 5+3 으로 갈라지던 문제). 중첩을 깊게 하는 대신 **형제 컴포넌트로 갈랐다**
 *   — CLAUDE.md "설계 원칙" 3번.
 *
 *   같이 정리한 것: `wrap` prop 은 **사용처가 0곳이었다**(전수조사). 죽은 분기를 남겨두면
 *   다음 사람이 "이걸 써야 하나" 고민하게 되므로 제거했다. 여러 줄이 필요하면 SegmentedGrid 를 쓴다.
 */
import React from 'react';
import PropTypes from 'prop-types';

const SegmentedControl = ({ options, value, onChange, block = true, disabled = false }) => (
    <div
        className="reserve-segmented"
        // nowrap 이다 — 줄바꿈이 필요하면 SegmentedGrid 를 쓴다.
        // flex-wrap 은 왼쪽부터 채우기 때문에 줄당 개수를 제어할 수 없고, 그게 5+3 사태의 원인이었다.
        style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, width: block ? '100%' : undefined }}
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
};

export default SegmentedControl;
