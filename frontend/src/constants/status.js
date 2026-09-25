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
    // 2026-08-11 백엔드 Reservation.ReservationStatus 에 추가된 값. 이 목록이 백엔드 enum과
    // 어긋나면 아래 라벨/색상 맵에도 구멍이 생겨 화면에 영어 enum이 그대로 노출된다.
    UNCONFIRMED: 'UNCONFIRMED',
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

/**
 * AntD <Tag color> 프리셋 이름.
 *
 * 2026-09-03 — 이 상수는 만들어만 두고 아무도 쓰지 않는 죽은 코드였고, 실제로 화면에
 * 칠해지던 값은 ReservationsAllTab 안의 사본이었다. 그래서 **지금 운영에서 보이는 색**을
 * 정본으로 옮겨왔다(사본은 삭제). 'gray' 는 AntD 프리셋이 아니라 CSS 색으로 해석돼
 * 혼자만 진한 태그가 되므로 프리셋인 'default' 로 바꾼다.
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

/**
 * 상태 필터 셀렉트용 옵션 — 내 예약 / 사장님 예약관리 / 관리자 전체예약이 같이 쓴다.
 *
 * 예전에는 세 화면이 각자 배열을 갖고 있었고 같은 상태를 서로 다르게 불렀다
 * (PENDING 이 '승인 대기' / '대기 중', CONFIRMED 가 '확정' / '승인됨' / '예약 확정').
 * 라벨은 RESERVATION_STATUS_LABELS 하나에서만 온다.
 */
export const RESERVATION_STATUS_FILTER_OPTIONS = [
    { value: 'ALL', label: '전체 상태' },
    ...RESERVATION_STATUS_ORDER.map((value) => ({ value, label: RESERVATION_STATUS_LABELS[value] })),
];
