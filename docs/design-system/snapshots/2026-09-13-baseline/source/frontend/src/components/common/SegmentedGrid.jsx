/**
 * RESERVE Design System - SegmentedGrid
 *
 * SegmentedControl 의 **여러 줄 버전**. 항목이 많아 한 줄에 안 들어갈 때 쓴다.
 * 모양(회색 트랙 + 선택 시 진한 배경)은 SegmentedControl 과 같고, 레이아웃만 그리드다.
 *
 * 사용법:
 *   <SegmentedGrid value={category} onChange={setCategory} options={CATEGORY_OPTIONS} columns={4} />
 *
 * ★ 왜 flex-wrap 이 아니라 grid 인가
 *   flex-wrap 은 **왼쪽부터 채우기** 때문에 줄당 개수를 제어할 수 없다.
 *   각 버튼에 최소 폭이 걸려 있으면 컨테이너 폭에 따라 줄당 개수가 제각각이 된다 —
 *   실제로 문의 유형 8개가 데스크톱에서 5+3 으로 갈라져 모달 높이가 한 줄만큼 늘어났다.
 *   그리드는 `repeat(columns, 1fr)` 로 줄당 개수가 고정이므로 항목 수를 columns 의 배수로 두면
 *   항상 대칭이고, 각 칸이 1fr 이라 버튼 폭도 균일해진다.
 *   덤으로 "혼자 남은 마지막 버튼이 줄 전체를 차지하는" flex-grow 버그도 구조적으로 사라진다.
 *
 * ★ 2026-08-06 신설 — SegmentedControl 에서 갈라냈다(prop 3분기 → 형제 컴포넌트).
 *   근거는 SegmentedControl.jsx 상단 주석과 CLAUDE.md "설계 원칙" 3번 참고.
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
