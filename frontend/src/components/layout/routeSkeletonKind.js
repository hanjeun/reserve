import { peekRedirect } from '../../utils/redirect';

// 라우트 구분은 RESERVE 패턴이다. 정적 페이지에 API 대기를 만들지 않는다.
// 2026-09-29: 로그인류·문서·준비 중·결제 결과·관리자·파트너·메시지를 각 실제 페이지 모양의 뼈대로 나눴다.
// 예전 공용 form/workspace/document 뼈대는 제목 위치·폭·높이가 실제와 달라 로딩이 끝날 때 화면이 튀었다.
// App.jsx 에 라우트를 추가하면 여기도 함께 고친다 — 빠뜨리면 로딩 중에 404 골격이 보인다.
export const normalizeRouteSkeletonPath = pathname => {
    let end = pathname.length;
    while (end > 0 && pathname[end - 1] === '/') end -= 1;
    return pathname.slice(0, end) || '/';
};

const EXACT_SKELETON_KINDS = new Map([
    ['/', 'discovery'], ['/search', 'search'], ['/my-page', 'my-page'],
    ['/store/register', 'store-form'], ['/stores', 'store-list'], ['/benefits', 'benefits'],
    ['/waiting', 'waiting'], ['/feed', 'coming-soon'],
    ['/my-stores', 'cards'], ['/my-favorites', 'cards'], ['/my-reservations', 'reservations'],
    ['/login', 'auth'], ['/signup', 'auth'], ['/forgot-password', 'auth'], ['/signup/social', 'auth'],
    ['/terms', 'legal'], ['/privacy', 'legal'], ['/content-sources', 'legal'],
    ['/operation-guide', 'guide'], ['/guide/user', 'guide'], ['/guide/business', 'guide'], ['/guide/common', 'guide'],
    ['/payment/result', 'payment-result'], ['/admin', 'admin'], ['/business', 'business'], ['/messages', 'messages'],
    ['/oauth2/callback', 'discovery'],
]);

// 콜백은 별도 문서가 아니라 인증 후 복귀할 화면의 대기 상태다. 복귀 경로는 여기서 소비하지 않는다.
export const resolveRouteSkeletonLocation = (pathname, search = '') => {
    const path = normalizeRouteSkeletonPath(pathname);
    if (path !== '/oauth2/callback') return { pathname: path, search };
    const params = new URLSearchParams(search);
    let target = peekRedirect() || '/';
    if (params.get('newUser') === 'true') target = '/signup/social';
    if (params.get('error')) target = '/login';
    const url = new URL(target, 'https://reserve.it.kr');
    return { pathname: url.pathname, search: url.search };
};

export const getRouteSkeletonKind = pathname => {
    const path = normalizeRouteSkeletonPath(pathname);
    const exactKind = EXACT_SKELETON_KINDS.get(path);
    if (exactKind) return exactKind;
    if (/^\/store\/[^/]+\/edit$/.test(path)) return 'store-form';
    if (/^\/store\/[^/]+$/.test(path)) return 'detail';
    if (/^\/benefits\/[^/]+$/.test(path)) return 'benefit-detail';
    // App.jsx 의 어떤 라우트에도 맞지 않는 주소 — NotFound(path="*")와 같은 틀의 골격을 그린다.
    return 'not-found';
};
