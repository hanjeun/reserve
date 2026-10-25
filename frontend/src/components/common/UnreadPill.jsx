/*
 * 읽지 않은 건수는 같은 표시를 공유하며 자리 수가 늘면 가로로 확장한다.
 */
import React from 'react';
import PropTypes from 'prop-types';
import { colors } from '../../styles/tokens';

const SIZE = 18;

const UnreadPill = ({ count, style }) => {
    if (!count || count <= 0) return null;
    return (
        <span
            style={{ ...styles.pill, ...style }}
            aria-label={`읽지 않음 ${count}건`}
        >
            {count > 99 ? '99+' : count}
        </span>
    );
};

const styles = {
    pill: {
        flexShrink: 0,
        display: 'inline-block',
        minWidth: SIZE,
        height: SIZE,
        padding: '0 5px',
        borderRadius: SIZE / 2,
        background: colors.primary.solid,
        color: colors.primary.foreground,
        fontSize: 11,
        lineHeight: `${SIZE}px`,
        textAlign: 'center',
        // 숫자가 바뀔 때 폭이 흔들리지 않게. 1 과 8 의 글자 폭이 다르면 알약이 떨린다.
        fontVariantNumeric: 'tabular-nums',
    },
};

UnreadPill.propTypes = {
    count: PropTypes.number,
    style: PropTypes.object,
};

export default UnreadPill;
