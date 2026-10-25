import { DISCOVERY_NAV_ITEMS, isDiscoveryRootPath } from '../constants/discovery';

const STORAGE_PREFIX = 'reserve:discovery-tab:v1:';
const snapshots = new Map();

export const discoveryPath = pathname => {
    let end = pathname.length;
    while (end > 0 && pathname[end - 1] === '/') end -= 1;
    return pathname.slice(0, end) || '/';
};
const tabPaths = new Set(DISCOVERY_NAV_ITEMS.map(item => item.to));
const positionOf = position => position && Number.isFinite(position.left) && Number.isFinite(position.top)
    ? { left: Math.max(0, position.left), top: Math.max(0, position.top) } : null;

function snapshotOf(pathname) {
    const path = discoveryPath(pathname);
    if (!tabPaths.has(path)) return null;
    if (!snapshots.has(path)) {
        let saved = null;
        try {
            const parsed = JSON.parse(sessionStorage.getItem(STORAGE_PREFIX + path));
            if (typeof parsed?.search === 'string' && isDiscoveryRootPath(path, parsed.search)) {
                saved = { search: parsed.search, position: positionOf(parsed.position) };
            }
        } catch { /* 세션 설정을 읽을 수 없으면 기본 탭으로 시작한다. */ }
        snapshots.set(path, saved);
    }
    return snapshots.get(path);
}

/* 탭별 URL 옵션을 유지하고 필터 검증·정규화는 해당 페이지가 담당한다. */
export function rememberDiscoveryLocation({ pathname, search = '' }, position) {
    const path = discoveryPath(pathname);
    if (!isDiscoveryRootPath(path, search)) return;
    const previous = snapshotOf(path);
    const next = {
        search,
        position: position === undefined
            ? (previous?.search === search ? previous.position : null)
            : positionOf(position),
    };
    snapshots.set(path, next);
    try { sessionStorage.setItem(STORAGE_PREFIX + path, JSON.stringify(next)); } catch { /* 저장소를 쓸 수 없으면 메모리 값만 유지한다. */ }
}

export function discoveryTabDestination(pathname, currentLocation) {
    const path = discoveryPath(pathname);
    const current = currentLocation && discoveryPath(currentLocation.pathname) === path
        && isDiscoveryRootPath(path, currentLocation.search);
    return { pathname: path, search: current ? currentLocation.search : (snapshotOf(path)?.search ?? '') };
}

export function discoveryScrollPosition({ pathname, search = '' }) {
    if (!isDiscoveryRootPath(pathname, search)) return null;
    const snapshot = snapshotOf(pathname);
    return snapshot?.search === search ? snapshot.position : null;
}

export function discoveryTabMotion(from, to) {
    const previous = DISCOVERY_NAV_ITEMS.findIndex(item => item.to === discoveryPath(from));
    const next = DISCOVERY_NAV_ITEMS.findIndex(item => item.to === discoveryPath(to));
    if (previous < 0 || next < 0 || previous === next) return undefined;
    return next > previous ? 'from-right' : 'from-left';
}
