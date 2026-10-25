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
    // 예약 상태 라벨은 서버 상태와 함께 유지한다.

    UNCONFIRMED: 'UNCONFIRMED',
};

export const RESERVATION_STATUS_LABELS = {
    PENDING:   '승인 대기',
    CONFIRMED: '예약 확정',
    CANCELLED: '취소됨',
    COMPLETED: '이용 완료',
    REJECTED:  '거절됨',
    NO_SHOW:   '노쇼',
    // 승인됐는데 예약 시각이 지나도록 완료·노쇼 처리가 안 된 건.
    // 사장님이 "아직 처리 안 한 건"으로 알아볼 수 있어야 하므로 '확정'과 다른 말을 쓴다.
    UNCONFIRMED: '미확인',
};

/*
 * AntD 기본 프리셋을 사용하며 중립 상태는 CSS 색 gray 대신 default로 지정한다.
 */
export const RESERVATION_STATUS_COLORS = {
    PENDING:   'orange',
    CONFIRMED: 'blue',
    // 확정(파랑)과 달라야 한다 — 사장님이 처리해야 할 건이라 눈에 걸려야 한다.
    UNCONFIRMED: 'gold',
    CANCELLED: 'default',
    COMPLETED: 'green',
    REJECTED:  'red',
    NO_SHOW:   'purple',
};

/**
 * 화면에 나열할 때의 표준 순서 — 예약이 실제로 흘러가는 순서를 따른다.
 * 상태 필터, 상태별 분포 차트가 전부 이 순서를 공유해야 화면마다 순서가 달라지지 않는다.
 */
export const RESERVATION_STATUS_ORDER = [
    'PENDING',
    'CONFIRMED',
    'UNCONFIRMED',
    'COMPLETED',
    'REJECTED',
    'CANCELLED',
    'NO_SHOW',
];

/*
 * 예약 필터는 공통 상태 라벨을 사용해 화면마다 다른 이름을 표시하지 않게 한다.
 */
export const RESERVATION_STATUS_FILTER_OPTIONS = [
    { value: 'ALL', label: '전체 상태' },
    ...RESERVATION_STATUS_ORDER.map((value) => ({ value, label: RESERVATION_STATUS_LABELS[value] })),
];

/** 내 예약·사업자 예약·관리자 예약 목록이 공유하는 정렬 메뉴. */
export const RESERVATION_SORT_OPTIONS = [
    { value: 'recent', label: '최신 예약순' },
    { value: 'oldest', label: '오래된 예약순' },
    { value: 'visit', label: '방문일 빠른순' },
];
