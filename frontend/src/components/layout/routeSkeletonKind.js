// 라우트 구분은 RESERVE 패턴이다. 정적 페이지에 API 대기를 만들지 않는다.
// 2026-09-29: 로그인류·문서·준비 중·결제 결과·관리자·파트너·메시지를 각 실제 페이지 모양의 뼈대로 나눴다.
// 예전 공용 form/workspace/document 뼈대는 제목 위치·폭·높이가 실제와 달라 로딩이 끝날 때 화면이 튀었다.
// App.jsx 에 라우트를 추가하면 여기도 함께 고친다 — 빠뜨리면 로딩 중에 404 골격이 보인다.
export const getRouteSkeletonKind = pathname => {
    const path = pathname.replace(/\/+$/, '') || '/';
    if (path === '/') return 'discovery';
    if (path === '/search') return 'search';
    if (path === '/my-page') return 'my-page';
    if (/^\/store\/[^/]+\/edit$/.test(path) || path === '/store/register') return 'store-form';
    if (/^\/store\/[^/]+$/.test(path)) return 'detail';
    if (path === '/stores') return 'store-list';
    if (path === '/benefits') return 'benefits';
    if (/^\/benefits\/[^/]+$/.test(path)) return 'benefit-detail';
    if (['/waiting', '/feed'].includes(path)) return 'coming-soon';
    if (['/my-stores', '/my-favorites'].includes(path)) return 'cards';
    if (path === '/my-reservations') return 'reservations';
    if (['/login', '/signup', '/forgot-password', '/signup/social'].includes(path)) return 'auth';
    if (['/terms', '/privacy', '/operation-guide', '/content-sources'].includes(path)) return 'legal';
    if (path === '/payment/result') return 'payment-result';
    if (path === '/admin') return 'admin';
    if (path === '/business') return 'business';
    if (path === '/messages') return 'messages';
    // 소셜 로그인 콜백 — 곧바로 다른 화면으로 넘어가는 문서형 틀
    if (path === '/oauth2/callback') return 'document';
    // App.jsx 의 어떤 라우트에도 맞지 않는 주소 — NotFound(path="*")와 같은 틀의 골격을 그린다.
    return 'not-found';
};
