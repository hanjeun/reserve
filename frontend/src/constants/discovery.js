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
        // 분야 사진·검색에서 진입하는 결과 목록은 탭 화면 안의 하위 화면이다.
        if (params.get('domain')?.trim() || params.get('keyword')?.trim()) return false;
    }
    return DISCOVERY_NAV_ITEMS.some(item => item.to === path);
};

// 홈·검색에서 같은 물체와 광학 크기를 사용한다. 배경 판이나 프레임을 덧붙이지 않는다.
export const SERVICE_DOMAIN_IMAGES = {
    FOOD:          { asset: 'food', width: 57, height: 46 },
    BEAUTY_CLINIC: { asset: 'beauty', width: 42, height: 53 },
    SPORTS:        { asset: 'sports', width: 57, height: 45 },
    PERFORMANCE:   { asset: 'class', width: 52, height: 50 },
    POPUP:         { asset: 'popup', width: 42, height: 54 },
    OTHER:         { asset: 'other', width: 53, height: 44 },
};
