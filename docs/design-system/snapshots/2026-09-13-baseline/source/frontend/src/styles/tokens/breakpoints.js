/**
 * RESERVE Design System - Breakpoints
 *
 * 2026-07-30 신설. 이전에는 480 / 575 / 576 / 767 / 768 / 900 여섯 값이 파일마다 흩어져 있었고,
 * 어떤 값이 "같은 의도"였는지 알 수 없었다(575와 576, 767과 768이 왜 다른지 근거가 없음).
 *
 * ★ 이 파일을 만들면서 값을 바꾸지 않았다. 기존에 쓰던 숫자를 그대로 옮기기만 한 것이라
 *   화면 동작은 1px도 달라지지 않는다. 값 변경은 별도 단계에서 근거와 함께 한다.
 *
 * 사용 규칙
 *  - JS 분기: useWindowWidth()와 비교. `useWindowWidth() >= bp.card`
 *  - CSS 미디어쿼리: max-width는 "미만"을 뜻하므로 bp에서 1을 뺀 값을 쓴다.
 *    (그래서 575/576, 767/768 쌍이 생겼던 것 — mq() 헬퍼로 실수를 막는다)
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

/**
 * max-width 미디어쿼리 문자열. `@media ${mq.below(breakpoints.tablet)}`
 * below(768)은 "768 미만" = `(max-width: 767px)`이다.
 * 이 -1을 손으로 쓰다가 767/768, 575/576이 섞였다.
 */
export const mq = {
    below: (bp) => `(max-width: ${bp - 1}px)`,
    atLeast: (bp) => `(min-width: ${bp}px)`,
};

export default breakpoints;
