const PREVIEW_ORIGIN = 'https://preview.invalid';
export const PREVIEW_STORE_PUBLIC_ID = '00000000-0000-4000-8000-000000000081';
export const PREVIEW_BUSINESS_TAB = 'analytics';

const PREVIEW_ROUTES = {
    explore: '/stores',
    booking: '/store/' + PREVIEW_STORE_PUBLIC_ID,
    reservations: '/my-reservations',
    waiting: '/my-reservations',
    qr: '/my-reservations',
    business: '/business',
};

export const isPreviewScene = scene => Object.hasOwn(PREVIEW_ROUTES, scene);
export const previewAssetBase = scene => scene === 'business' ? '/service-preview/business/' : '/service-preview/';
export const previewDocumentPath = scene => `${previewAssetBase(scene)}index.html?scene=${scene}`;

export function resolvePreviewLocation(scene, to = {}) {
    const pathname = PREVIEW_ROUTES[isPreviewScene(scene) ? scene : 'explore'];
    const target = typeof to === 'string' ? new URL(to, PREVIEW_ORIGIN + pathname) : to;
    if ((target.origin && target.origin !== PREVIEW_ORIGIN) || (target.pathname && target.pathname !== pathname)) return null;
    const params = new URLSearchParams(target.search);
    if (pathname === '/my-reservations' && !['reservation', 'waiting'].includes(params.get('tab'))) {
        params.set('tab', scene === 'waiting' ? 'waiting' : 'reservation');
    }
    if (pathname === '/business') params.set('tab', PREVIEW_BUSINESS_TAB);
    return { pathname, search: params.size ? '?' + params : '', hash: target.hash || '' };
}
