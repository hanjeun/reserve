// 끝의 '/'를 전부 걷어낸다 — /\/+$/ 정규식은 '/'가 길게 이어지면 역추적이 커서 반복문으로 같은 결과를 만든다.
const trimTrailingSlashes = value => {
    let end = value.length;
    while (end > 0 && value[end - 1] === '/') end -= 1;
    return value.slice(0, end);
};

// 라우트 구분은 RESERVE 패턴이다. 정적 페이지에 API 대기를 만들지 않는다.
export const getRouteSkeletonKind = pathname => {
    const path = trimTrailingSlashes(pathname) || '/';
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
