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
    // 승인됐는데 예약 시각이 지나도록 완료·노쇼 처리가 안 된 건 (2026-08-11 신설).
    // 사장님이 "아직 처리 안 한 건"으로 알아볼 수 있어야 하므로 '확정'과 다른 말을 쓴다.
    UNCONFIRMED: '미확인',
};

export const RESERVATION_STATUS_COLORS = {
    PENDING:   'orange',
    CONFIRMED: 'blue',
    UNCONFIRMED: 'orange',
    CANCELLED: 'red',
    COMPLETED: 'green',
    REJECTED:  'red',
    NO_SHOW:   'gray',
};
