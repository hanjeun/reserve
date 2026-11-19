import { useEffect, useState } from 'react';
import { getRouteSkeletonKind, resolveRouteSkeletonLocation } from './routeSkeletonKind';
import WaitingRouteSkeleton from '../waiting/WaitingRouteSkeleton';
import StoreDetailLoading from '../store/StoreDetailLoading';
import DiscoveryRouteSkeleton from './DiscoveryRouteSkeleton';

// 첫 주소의 골격만 미리 받는다. 홈 때문에 메신저·관리자 골격과 그 UI까지 로딩하지 않는다.
// 새 탭의 첫 골격부터 같은 형태를 쓴다. 일반 임시 골격→페이지 골격의 두 단계 전환을 하지 않는다.
const modules = new Map([['waiting', { default: WaitingRouteSkeleton }],
    ['detail', { default: StoreDetailLoading }], ['discovery', { default: DiscoveryRouteSkeleton }]]);
const moduleKey = kind => kind === 'feed' || kind?.startsWith('feed-') ? 'feed' : modules.has(kind) ? kind : 'pages';
const loaders = {
    feed: () => import('../feed/FeedRouteSkeleton'),
    pages: () => import('./RouteSkeletonPages'),
};
const requests = new Map();

export function preloadRouteSkeletons(kind) {
    const key = moduleKey(kind);
    const module = modules.get(key);
    if (module) return Promise.resolve(module);
    if (!requests.has(key)) {
        requests.set(key, loaders[key]().then(next => {
            modules.set(key, next);
            return next;
        }, () => null).finally(() => requests.delete(key)));
    }
    return requests.get(key);
}

if (typeof window !== 'undefined') {
    const location = resolveRouteSkeletonLocation(window.location.pathname, window.location.search);
    void preloadRouteSkeletons(getRouteSkeletonKind(location.pathname));
}

export function usePageSkeletonModule(kind) {
    const key = moduleKey(kind);
    const [loaded, setLoaded] = useState(() => ({ key, module: modules.get(key) }));
    const module = modules.get(key) ?? (loaded.key === key ? loaded.module : null);
    useEffect(() => {
        if (module) return undefined;
        let alive = true;
        void preloadRouteSkeletons(kind).then(next => { if (alive && next) setLoaded({ key, module: next }); });
        return () => { alive = false; };
    }, [kind, key, module]);
    return module;
}

