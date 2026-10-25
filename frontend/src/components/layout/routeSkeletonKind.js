import { peekRedirect } from '../../utils/redirect';

// 정적 라우트는 API 대기를 만들지 않는다.
// 실제 페이지 배치에 맞는 라우트별 골격을 선택한다.

// 라우트를 추가할 때 골격 매핑도 함께 갱신한다.
export const normalizeRouteSkeletonPath = pathname => {
    let end = pathname.length;
    while (end > 0 && pathname[end - 1] === '/') end -= 1;
    return pathname.slice(0, end) || '/';
};

const EXACT_SKELETON_KINDS = new Map([
    ['/', 'discovery'], ['/search', 'search'], ['/my-page', 'my-page'],
    ['/store/register', 'store-form'], ['/stores', 'store-list'], ['/benefits', 'benefits'],
    ['/waiting', 'waiting'], ['/feed', 'feed'], ['/feed/notifications', 'feed-notifications'],
    ['/drafts/transfer', 'draft-transfer'],
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
    if (/^\/feed\/posts\/[^/]+$/.test(path)) return 'feed-detail';
    if (/^\/feed\/u\/[^/]+$/.test(path)) return 'feed-author';
    // App.jsx 의 어떤 라우트에도 맞지 않는 주소 — NotFound(path="*")와 같은 틀의 골격을 그린다.
    return 'not-found';
};
