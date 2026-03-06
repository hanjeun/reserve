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
};

const ReservationStatusBadge = ({ status }) => {
    const style = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
    return (
        <span style={{
            color: style.color,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.semibold,
            whiteSpace: 'nowrap',
        }}>
            {RESERVATION_STATUS_LABELS[status] ?? status}
        </span>
    );
};

export default ReservationStatusBadge;
