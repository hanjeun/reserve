import { imageDimensions } from './imageDimensions';

/** The detail gallery, its loading state and cached hints share the same image order. */
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

/** The unchanged non-adaptive carousel occupies the tallest same-width slide. */
export const storeGalleryLayoutRatio = store => {
    const images = storeGalleryImages(store);
    if (images.length < 2 || images.some(image => !image.url || !imageDimensions(image))) return null;
    return Math.min(...images.map(image => image.width / image.height));
};
