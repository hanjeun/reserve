import React from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/**
 * RESERVE Design System - PieLegend
 *
 * 도넛/파이 차트 옆에 붙이는 범례 리스트 — 색상 점 + 이름 + 퍼센트.
 *
 * 2026-07 추가: 기존엔 Pie의 label prop(`${name} ${percent}%`)으로 파이 조각 위에 직접
 * 텍스트를 얹었는데, 카드 폭이 좁거나(사업자 통계 탭 minWidth=280) 항목이 많아지면
 * (예약 상태는 최대 6종) 라벨이 파이 반지름 밖으로 튀어나가 카드 경계를 넘고, ChartCard가
 * overflow를 막아두지 않아서 옆 카드 위에 겹쳐 그려지며 가려지는 문제가 있었다
 * (예: "상태별 분포" 카드에서 "승인됨 100%"가 "예약 추이" 카드에 가려 "!됨 100%"처럼 보임).
 * → 라벨을 파이 위에서 완전히 제거하고, 옆에 고정 폭 리스트로 분리하면 항목 수·카드 폭과
 *   무관하게 겹침이 원천적으로 발생하지 않는다. 관리자 DashboardTab과 사업자 StatisticsTab이
 *   동일한 파이 패턴을 쓰므로 이 컴포넌트를 공유한다.
 */
const PieLegend = ({ data, palette }) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, flex: 1 }}>
            {data.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: palette[i % palette.length], flexShrink: 0,
                    }} />
                    <Text
                        style={{
                            fontSize: fontSize.sm, color: colors.text.secondary, flex: 1, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                    >
                        {d.name}
                    </Text>
                    {/* 숫자 칸에는 반드시 whiteSpace: nowrap을 준다.
                        flexShrink: 0만으로는 부족하다 — 폭이 고정되면 그 안에서 글자 단위로 접힌다.
                        실제로 아래 퍼센트가 width: 34였는데 "100%"(4글자)가 안 들어가서
                        "100 / %" 두 줄로 쪼개졌다(대시보드 "상태별 분포"에서 확인).
                        width 대신 minWidth를 쓰는 이유: 오른쪽 정렬을 유지하면서도 세 자리 수(100%)나
                        네 자리 건수가 오면 칸이 늘어날 수 있어야 한다. */}
                    <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {d.value}건
                    </Text>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, flexShrink: 0, minWidth: 42, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {total ? Math.round((d.value / total) * 100) : 0}%
                    </Text>
                </div>
            ))}
        </div>
    );
};

PieLegend.propTypes = {
    data: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        value: PropTypes.number.isRequired,
    })).isRequired,
    palette: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default PieLegend;
