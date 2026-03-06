/**
 * RESERVE - 예약 상태 상수
 * ※ 백엔드 ReservationStatus enum과 정확히 일치
 */

export const RESERVATION_STATUS = {
    PENDING:   'PENDING',
    CONFIRMED: 'CONFIRMED',
    CANCELLED: 'CANCELLED',
    COMPLETED: 'COMPLETED',
    REJECTED:  'REJECTED',
    NO_SHOW:   'NO_SHOW',
};

export const RESERVATION_STATUS_LABELS = {
    PENDING:   '승인 대기',
    CONFIRMED: '예약 확정',
    CANCELLED: '취소됨',
    COMPLETED: '이용 완료',
    REJECTED:  '거절됨',
    NO_SHOW:   '노쇼',
};

export const RESERVATION_STATUS_COLORS = {
    PENDING:   'orange',
    CONFIRMED: 'blue',
    CANCELLED: 'red',
    COMPLETED: 'green',
    REJECTED:  'red',
    NO_SHOW:   'gray',
};
