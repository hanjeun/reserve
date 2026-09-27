export const MESSENGER_ROUTE_CLOSE_EVENT = 'reserve:messenger-route-close';

/**
 * Header처럼 /messages 바깥에 있는 컨트롤이 먼저 축소 모션을 요청하는 관문.
 * 화면이 아직 마운트되지 않았다면 false를 반환해 호출부가 즉시 뒤로 갈 수 있게 한다.
 * to 를 주면 닫힘 애니메이션 뒤 그 경로로 간다(예: 로고 → 홈). 없으면 이전 화면으로 돌아간다(2026-09-24).
 */
export const requestMessengerRouteClose = (to) => {
    if (typeof window === 'undefined') return false;
    const event = new CustomEvent(MESSENGER_ROUTE_CLOSE_EVENT, { cancelable: true, detail: { to } });
    window.dispatchEvent(event);
    return event.defaultPrevented;
};
