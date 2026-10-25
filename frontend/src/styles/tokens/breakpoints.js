/*
 * 화면 경계는 공통 토큰으로 비교한다. 최대 폭 미디어쿼리는 경계보다 1px 작은 값을 사용한다.
 */

export const breakpoints = {
    /** 예약 카드가 넓은 레이아웃으로 전환 (ReservationRow, DataTable) */
    card: 576,
    /** 태블릿 경계 — Home 모바일/PC 레이아웃, AntD 컴포넌트 모바일 조정 */
    tablet: 768,
    /** PC 2단 레이아웃 (StoreDetail), 목록 그리드 다열 */
    pc: 900,
    /** 목록 그리드 1열 전환 */
    gridNarrow: 480,
};

/*
 * below는 주어진 경계 미만의 max-width 미디어쿼리를 반환한다.
 */
export const mq = {
    below: (bp) => `(max-width: ${bp - 1}px)`,
    atLeast: (bp) => `(min-width: ${bp}px)`,
};

export default breakpoints;
