export const DISCOVERY_ASSET_ROOT = '/images/discovery-v3/';

// 주요 탐색 화면의 탭과 헤더 분기를 같은 목록에서 결정한다.
export const DISCOVERY_NAV_ITEMS = [
    { to: '/', label: '홈' },
    { to: '/stores', label: '탐색' },
    { to: '/benefits', label: '혜택' },
    { to: '/waiting', label: '웨이팅' },
    { to: '/feed', label: '피드' },
];

export const isDiscoveryRootPath = (pathname, search = '') => {
    const path = pathname.replace(/\/$/, '') || '/';
    if (path === '/stores') {
        const params = new URLSearchParams(search);
        // 분야 필터는 탐색 탭 안에 남는다. 검색 결과만 검색 이전 페이지로 돌아가는 하위 화면이다.
        if (params.get('keyword')?.trim()) return false;
    }
    return DISCOVERY_NAV_ITEMS.some(item => item.to === path);
};

const domainFiles = import.meta.glob('../assets/service-domains/*-512.webp', { eager: true, query: '?url&no-inline', import: 'default' });
const domainSources = Object.fromEntries(Object.entries(domainFiles).map(([path, url]) => [path.split('/').pop().replace('-512.webp', ''), url]));

// 홈·검색·등록에서 같은 둥근 물체를 사용한다. 배경 판이나 프레임을 덧붙이지 않는다.
export const SERVICE_DOMAIN_IMAGES = {
    FOOD:          { asset: 'food', src: domainSources.food, width: 56, height: 56 },
    BEAUTY_CLINIC: { asset: 'beauty', src: domainSources.beauty, width: 56, height: 56 },
    SPORTS:        { asset: 'sports', src: domainSources.sports, width: 56, height: 56 },
    PERFORMANCE:   { asset: 'class', src: domainSources.performance, width: 56, height: 56 },
    POPUP:         { asset: 'popup', src: domainSources.popup, width: 56, height: 56 },
    OTHER:         { asset: 'other', src: domainSources.other, width: 56, height: 56 },
};
