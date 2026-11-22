export const photoPreviewClassNames = { popup: { root: 'reserve-image-preview reserve-store-detail-preview' } };

export const PHOTO_PREVIEW_LABEL = '크게 보기';
export const PHOTO_SLIDE_DURATION_MS = 500;
export const PHOTO_SLIDE_EASING = 'ease';
export const PHOTO_SORT_HOLD_MS = 180;
export const PHOTO_TOUCH_SLOP = 8;
export const isHorizontalPhotoSwipe = (dx, dy) => Math.abs(dx) >= 18 && Math.abs(dx) >= Math.abs(dy) * 1.25;
export const withPhotoPreviewHint = (preview = true) => preview === false ? false : {
    cover: '',
    ...(preview && typeof preview === 'object' ? preview : {}),
};

export const rememberPhotoPreviewOrigin = event => {
    const source = event.target?.closest?.('.ant-image') ?? event.currentTarget;
    const rect = source?.getBoundingClientRect?.();
    if (!rect) return;
    const owner = source.ownerDocument;
    const { style } = owner === document ? owner.documentElement : owner.body;
    style.setProperty('--reserve-store-preview-origin-x', `${rect.left + rect.width / 2}px`);
    style.setProperty('--reserve-store-preview-origin-y', `${rect.top + rect.height / 2}px`);
};
