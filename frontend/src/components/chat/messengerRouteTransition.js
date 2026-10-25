export const MESSENGER_ROUTE_CLOSE_EVENT = 'reserve:messenger-route-close';

/*
 * 외부 도구의 닫힘 요청은 화면이 없으면 false를 반환한다. 목적지가 있으면 닫힘 뒤 그 경로로, 없으면 이전 화면으로 이동한다.
 */
export const requestMessengerRouteClose = (to) => {
    if (typeof window === 'undefined') return false;
    const event = new CustomEvent(MESSENGER_ROUTE_CLOSE_EVENT, { cancelable: true, detail: { to } });
    window.dispatchEvent(event);
    return event.defaultPrevented;
};
