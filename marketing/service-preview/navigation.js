const PREVIEW_ORIGIN = 'https://preview.invalid';
export const PREVIEW_STORE_PUBLIC_ID = '00000000-0000-4000-8000-000000000081';

export function resolvePreviewLocation(scene, to = {}) {
    const pathname = scene === 'explore' ? '/stores' : scene === 'booking' ? '/store/' + PREVIEW_STORE_PUBLIC_ID : '/my-reservations';
    const target = typeof to === 'string' ? new URL(to, PREVIEW_ORIGIN + pathname) : to;
    if ((target.origin && target.origin !== PREVIEW_ORIGIN) || (target.pathname && target.pathname !== pathname)) return null;
    const params = new URLSearchParams(target.search);
    if (pathname === '/my-reservations' && !['reservation', 'waiting'].includes(params.get('tab'))) {
        params.set('tab', scene === 'waiting' ? 'waiting' : 'reservation');
    }
    return { pathname, search: params.size ? '?' + params : '', hash: target.hash || '' };
}
