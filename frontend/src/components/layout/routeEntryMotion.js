export const ROUTE_ENTRY_DIRECTIONS = new Set(['from-left', 'from-right']);

export const getRouteHistoryIndex = () => {
    const index = window.history.state?.idx;
    return typeof index === 'number' ? index : null;
};

const isSearchPath = (pathname) => /^\/search\/?$/.test(pathname || '');
export const clearRouteEntryMotion = content => {
    content?.classList.remove('reserve-route-entry--from-right', 'reserve-route-entry--from-left');
};

// 같은 화면의 view 정규화·필터 변경은 새 진입이 아니며, 진행 중인 진입을 취소하지도 않는다.
export const applyRouteEntryMotion = (content, { pathnameChanged, direction, skeletonShown }) => {
    if (!content || (!pathnameChanged && !skeletonShown)) return;
    clearRouteEntryMotion(content);
    if (direction && !skeletonShown) {
        content.getBoundingClientRect();
        content.classList.add('reserve-route-entry--' + direction);
    }
};

// 자체 열림·닫힘 모션이 있는 경로는 페이지 이동 모션을 중복하지 않는다.
// 자체 진입·퇴장이 있는 화면에는 가로 페이지 전환을 겹치지 않는다.
const hasOwnMotion = (pathname) => isSearchPath(pathname) || /^\/messages(\/|$)/.test(pathname || '');

// 두 위치가 모두 있고 서로 다르면 앞/뒤 방향을, 아니면 null 을 돌려준다.
const directionBetween = (previous, current, isKnown) => {
    if (!isKnown(previous) || !isKnown(current) || previous === current) return null;
    return current > previous ? 'from-right' : 'from-left';
};
const isTabIndex = (index) => index >= 0;
const isHistoryIndex = (index) => index != null;

// 전환을 걸지 않는 이동 — 같은 화면, 검색 닫기, 자체 애니메이션 화면.
const skipsRouteMotion = (previousPathname, pathname) => {
    if (!previousPathname || previousPathname === pathname) return true;

    // 검색을 닫는 이동은 검색창의 닫힘 모션만 적용한다.
    // 검색을 닫으면 원래 화면을 가로 전환 없이 복원한다.
    if (isSearchPath(previousPathname)) return true;
    return hasOwnMotion(previousPathname) || hasOwnMotion(pathname);
};

export const resolveRouteEntryMotion = ({
    previousPathname,
    pathname,
    previousDiscoveryTabIndex,
    currentDiscoveryTabIndex,
    previousHistoryIndex,
    historyIndex,
    navigationType,
    explicitDirection,
}) => {
    if (skipsRouteMotion(previousPathname, pathname)) return null;

    const tabDirection = directionBetween(previousDiscoveryTabIndex, currentDiscoveryTabIndex, isTabIndex);
    if (tabDirection) return tabDirection;

    const historyDirection = directionBetween(previousHistoryIndex, historyIndex, isHistoryIndex);
    if (navigationType === 'POP') return historyDirection ?? 'from-left';

    if (ROUTE_ENTRY_DIRECTIONS.has(explicitDirection)) return explicitDirection;

    // replace 이동은 기본적으로 전환하지 않는다 — 권한·세션 안전장치(남의 예약, 권한 없음, 이미 로그인됨),
    // 소셜 로그인 콜백처럼 사용자가 화면을 옮긴 게 아니기 때문이다. 사용자가 끝낸 흐름(로그아웃·탈퇴·가입 완료 → 홈,
    // 로그인 필요 → 로그인, 로그인 후 원래 가려던 곳)은 호출부가 의미에 맞는 방향을 reserveRouteMotion 으로 명시한다.
    if (navigationType === 'REPLACE') return null;

    return historyDirection ?? 'from-right';
};
