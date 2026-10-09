import { useEffect, useState } from 'react';
import { getRouteSkeletonKind, resolveRouteSkeletonLocation } from './routeSkeletonKind';

// 첫 주소의 골격만 미리 받는다. 홈 때문에 메신저·관리자 골격과 그 UI까지 로딩하지 않는다.
const modules = new Map();
const requests = new Map();
const moduleKey = kind => kind === 'discovery' ? 'discovery' : 'pages';
// import 두 개를 같은 삼항식에 넣으면 Vite가 두 분기의 modulepreload를 합친다.
const loaders = {
    discovery: () => import('./DiscoveryRouteSkeleton'),
    pages: () => import('./RouteSkeletonPages'),
};

export function preloadRouteSkeletons(kind) {
    const key = moduleKey(kind);
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

