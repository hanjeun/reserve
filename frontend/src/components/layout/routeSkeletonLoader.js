import { useEffect, useState } from 'react';
import { getRouteSkeletonKind, resolveRouteSkeletonLocation } from './routeSkeletonKind';
import FeedRouteSkeleton from '../feed/FeedRouteSkeleton';
import WaitingRouteSkeleton from '../waiting/WaitingRouteSkeleton';
import StoreDetailLoading from '../store/StoreDetailLoading';
import DiscoveryRouteSkeleton from './DiscoveryRouteSkeleton';

// 첫 주소의 골격만 미리 받는다. 홈 때문에 메신저·관리자 골격과 그 UI까지 로딩하지 않는다.
// 새 탭의 첫 골격부터 같은 형태를 쓴다. 일반 임시 골격→페이지 골격의 두 단계 전환을 하지 않는다.
const modules = new Map([['feed', { default: FeedRouteSkeleton }], ['waiting', { default: WaitingRouteSkeleton }],
    ['detail', { default: StoreDetailLoading }], ['discovery', { default: DiscoveryRouteSkeleton }]]);
const requests = new Map();
const moduleKey = kind => ['waiting', 'detail'].includes(kind) ? kind : ['feed', 'feed-detail', 'feed-author', 'feed-notifications'].includes(kind) ? 'feed' : kind === 'discovery' ? 'discovery' : 'pages';
// 업무별 골격은 해당 주소에서만 내려받는다.
const loaders = {
    pages: () => import('./RouteSkeletonPages'),
};

export function preloadRouteSkeletons(kind) {
    const key = moduleKey(kind);
    if (modules.has(key)) return Promise.resolve(modules.get(key));
    if (!requests.has(key)) {
        const request = loaders[key]();
        requests.set(key, request
            .then(module => { modules.set(key, module); return module; })
            .catch(() => null));
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

