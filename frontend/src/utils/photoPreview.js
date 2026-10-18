export const photoPreviewClassNames = { popup: { root: 'reserve-image-preview reserve-store-detail-preview' } };

export const rememberPhotoPreviewOrigin = event => {
    const source = event.target?.closest?.('.ant-image') ?? event.currentTarget;
    const rect = source?.getBoundingClientRect?.();
    if (!rect || typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--reserve-store-preview-origin-x', `${rect.left + rect.width / 2}px`);
    document.documentElement.style.setProperty('--reserve-store-preview-origin-y', `${rect.top + rect.height / 2}px`);
};
