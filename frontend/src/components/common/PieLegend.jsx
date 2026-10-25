import React from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/*
 * 좁은 카드에서 라벨이 파이와 겹치지 않도록 별도 범례를 사용한다.
 */
const PieLegend = ({ data, palette }) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, flex: 1 }}>
            {data.map((d, i) => (
                <div key={d.key ?? d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
                    {/*
                     * 퍼센트·건수는 줄바꿈하지 않고 숫자 길이에 따라 최소 너비를 늘린다.
                     */}
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
        /** 이름이 겹칠 수 있는 목록(알 수 없는 상태가 여럿이면 전부 '기타')에서 쓰는 안정적인 key.
            없으면 name 으로 대체한다 — 기존 호출부는 그대로 동작한다. */
        key: PropTypes.string,
    })).isRequired,
    palette: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default PieLegend;
