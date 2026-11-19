import { imageDimensions } from './imageDimensions';
import { isLegacyStoreId } from './storePublicAddress';

const IMAGE_HOSTS = new Set(['cdn.reserve.it.kr', 'reserve.it.kr', 'app.reserve.it.kr']);

export function publicStoreImageUrl(value, storeId, { thumbnailOnly = false } = {}) {
    if (typeof value !== 'string' || !isLegacyStoreId(storeId)) return null;
    try {
        const url = new URL(value);
        const path = decodeURIComponent(url.pathname);
        const folder = thumbnailOnly ? 'thumbnails' : '(?:images|thumbnails)';
        const namespace = thumbnailOnly ? '(?:/local)?' : '';
        if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname) || url.username || url.password
            || url.port || url.search || url.hash || path.includes('\\')
            || !new RegExp(`^${namespace}/users/[0-9]+/stores/${storeId}/${folder}/[^/]+$`).test(path)) return null;
        return value;
    } catch { return null; }
}

/* 상세·골격·캐시 힌트가 같은 사진 순서를 사용한다. */
export const storeGalleryImages = store => {
    if (!store) return [];
    if (store.detailImageUrls?.length) {
        return store.detailImageUrls.map(url => {
            const meta = store.detailImageMeta?.find(image => image?.url === url);
            return { url, ...imageDimensions(meta) };
        });
    }
    return [{ url: store.mainImageUrl, ...imageDimensions({ width: store.mainImageWidth, height: store.mainImageHeight }) }];
};

export const storeCoverImage = store => storeGalleryImages(store)[0] ?? null;

/* 높이 자동 조정이 없는 캐러셀은 같은 너비의 사진 중 최대 높이를 사용한다. */
export const storeGalleryLayoutRatio = store => {
    const images = storeGalleryImages(store);
    if (images.length < 2 || images.some(image => !image.url || !imageDimensions(image))) return null;
    return Math.min(...images.map(image => image.width / image.height));
};
