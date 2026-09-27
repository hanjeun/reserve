export const ROUTE_ENTRY_DIRECTIONS = new Set(['from-left', 'from-right']);

export const getRouteHistoryIndex = () => {
    const index = window.history.state?.idx;
    return typeof index === 'number' ? index : null;
};

const isSearchPath = (pathname) => /^\/search\/?$/.test(pathname || '');
// 자기 열기·닫기 애니메이션이 있는 화면 — 모바일 메시지(/messages)는 채팅이 열리고 닫히는 것이지 페이지 이동이 아니다.
// 들어갈 때도 나올 때도 페이지 전환(옆으로 밀기)을 걸지 않고 화면 자체 애니메이션만 재생한다(2026-09-24).
const hasOwnMotion = (pathname) => isSearchPath(pathname) || /^\/messages(\/|$)/.test(pathname || '');

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
    if (!previousPathname || previousPathname === pathname) return null;

    // 검색 화면을 닫는 이동(검색 실행·빠른 검색·취소·Esc)은 화면을 옮기는 게 아니라 검색창을 닫는 것이다.
    // 결과(또는 원래 화면)가 전환 없이 바로 보이고, 결과는 스켈레톤으로 채워진다 (2026-09-23).
    if (isSearchPath(previousPathname)) return null;
    if (hasOwnMotion(previousPathname) || hasOwnMotion(pathname)) return null;

    if (previousDiscoveryTabIndex >= 0 && currentDiscoveryTabIndex >= 0
        && previousDiscoveryTabIndex !== currentDiscoveryTabIndex) {
        return currentDiscoveryTabIndex > previousDiscoveryTabIndex ? 'from-right' : 'from-left';
    }

    if (navigationType === 'POP') {
        if (previousHistoryIndex != null && historyIndex != null && previousHistoryIndex !== historyIndex) {
            return historyIndex > previousHistoryIndex ? 'from-right' : 'from-left';
        }
        return 'from-left';
    }

    if (ROUTE_ENTRY_DIRECTIONS.has(explicitDirection)) return explicitDirection;

    // replace 이동은 기본적으로 전환하지 않는다 — 권한·세션 안전장치(남의 예약, 권한 없음, 이미 로그인됨),
    // 소셜 로그인 콜백처럼 사용자가 화면을 옮긴 게 아니기 때문이다. 사용자가 끝낸 흐름(로그아웃·탈퇴·가입 완료 → 홈,
    // 로그인 필요 → 로그인, 로그인 후 원래 가려던 곳)은 호출부가 의미에 맞는 방향을 reserveRouteMotion 으로 명시한다.
    if (navigationType === 'REPLACE') return null;

    if (previousHistoryIndex != null && historyIndex != null && previousHistoryIndex !== historyIndex) {
        return historyIndex > previousHistoryIndex ? 'from-right' : 'from-left';
    }

    return 'from-right';
};
