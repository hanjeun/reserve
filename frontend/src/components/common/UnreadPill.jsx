/**
 * 안 읽은 개수 표시 — 관리자 탭 라벨과 채팅 방 목록이 **같은 것을 쓴다.**
 *
 * <h3>왜 AntD `Badge` 를 안 쓰나 (2026-08-25)</h3>
 * 탭 라벨은 `<Badge count>`(AntD 기본 빨강 원)를, 바로 아래 방 목록은 파란 알약을 쓰고 있었다.
 * **같은 뜻의 숫자가 한 화면에서 두 가지 모양으로** 나왔다.
 *
 * 색은 파랑을 택했다 — 빨강은 이 서비스에서 **되돌릴 수 없는 것**(거절·삭제·환불 실패)에만 쓴다.
 * 답을 기다리는 문의는 나쁜 일이 아니라 **할 일**이라 primary 가 맞다.
 * AntD 의 빨강(#ff4d4f)은 토큰의 error(#f04452)와도 값이 달라서, 쓰는 순간 색이 하나 더 늘어난다.
 *
 * 알약(원이 아니라 모서리 둥근 사각)인 이유 — 두 자리 이상이 되면 원은 찌그러진다.
 * `minWidth` 로 한 자리일 때만 원에 가깝게 보이고, 늘어나면 자연스럽게 옆으로 자란다.
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
        background: colors.primary.main,
        color: '#fff',
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
