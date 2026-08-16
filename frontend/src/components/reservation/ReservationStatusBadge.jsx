import React from 'react';
import { RESERVATION_STATUS_LABELS } from '../../constants';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

/**
 * 예약 상태 - 동그란 뱃지 제거, 텍스트 컬러만으로 표현
 */
const STATUS_STYLE = {
    PENDING:   { color: colors.warning.main   },
    CONFIRMED: { color: colors.primary.main   },
    REJECTED:  { color: colors.error.main     },
    CANCELLED: { color: colors.text.tertiary  },
    COMPLETED: { color: colors.success.main   },
    NO_SHOW:   { color: colors.text.tertiary  },
    // 확정(파랑)과 달라야 한다 — 사장님이 처리해야 할 건이라 눈에 걸려야 하고,
    // 대기(주황)와도 성격이 비슷하다("네가 할 일이 남았다").
    UNCONFIRMED: { color: colors.warning.main },
};

/**
 * `unpaid` — 예약금이 있는데 아직 결제되지 않은 건.
 * 별도 줄로 빼면 오른쪽 컬럼이 한 줄 더 길어져 스켈레톤·카드 높이가 어긋나므로
 * 상태 라벨 뒤에 괄호로 붙인다("승인 대기 (미결제)").
 */
const ReservationStatusBadge = ({ status, unpaid = false }) => {
    const style = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
    return (
        <span style={{
            color: style.color,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.semibold,
            whiteSpace: 'nowrap',
            // ReservationRow가 줄 높이를 15px로 고정하므로 기본 line-height(1.5714=20.4)를 눌러둔다.
            lineHeight: 1,
        }}>
            {RESERVATION_STATUS_LABELS[status] ?? status}
            {unpaid && ' (미결제)'}
        </span>
    );
};

export default ReservationStatusBadge;
