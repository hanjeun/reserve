// 라우트 구분은 RESERVE 패턴이다. 정적 페이지에 API 대기를 만들지 않는다.
export const getRouteSkeletonKind = pathname => {
    const path = pathname.replace(/\/+$/, '') || '/';
    if (path === '/') return 'discovery';
    if (path === '/search') return 'search';
    if (path === '/my-page') return 'my-page';
    if (/^\/store\/[^/]+\/edit$/.test(path) || path === '/store/register') return 'store-form';
    if (/^\/store\/[^/]+$/.test(path)) return 'detail';
    if (path === '/stores') return 'store-list';
    if (path === '/benefits') return 'benefits';
    if (['/my-stores', '/my-favorites'].includes(path)) return 'cards';
    if (path === '/my-reservations') return 'reservations';
    if (['/login', '/signup', '/forgot-password', '/signup/social'].includes(path)) return 'form';
    if (['/admin', '/business', '/messages'].includes(path)) return 'workspace';
    return 'document';
};
