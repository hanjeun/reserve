import { useEffect, useState } from 'react';

// 페이지별 큰 뼈대(로그인류·문서·결제 결과·관리자·파트너·메시지·가게 폼)는 별도 청크다.
// 앱 셸 청크가 번들 예산(600KiB)에 닿아 있어 여기 다 넣을 수 없다(2026-09-29 실측: +21kB 로 초과).
// 앱 셸이 실행되는 즉시 받기 시작하므로 로그인 확인(/api/member/me)이 끝나기 전에 대개 도착한다.
// 도착 전에는 같은 최소 높이의 빈 자리를 두어 푸터가 위로 올라왔다 내려가지 않게 한다.
let pageSkeletonModule = null;
const pageSkeletonRequest = import('./RouteSkeletonPages')
    .then(module => { pageSkeletonModule = module; return module; })
    .catch(() => null); // 청크를 못 받으면(오프라인 등) 빈 자리로 남는다 — 실제 페이지 청크도 같은 이유로 실패한다.
/** 테스트·미리 받기용 — 페이지별 뼈대 청크가 준비되면 끝나는 약속. */
export const preloadRouteSkeletons = () => pageSkeletonRequest;

export function usePageSkeletonModule() {
    const [module, setModule] = useState(pageSkeletonModule);
    useEffect(() => {
        if (module) return undefined;
        let alive = true;
        // Import failure is already normalized to null; this subscription does not outlive the effect.
        void pageSkeletonRequest.then(loaded => { if (alive && loaded) setModule(loaded); });
        return () => { alive = false; };
    }, [module]);
    return module;
}

