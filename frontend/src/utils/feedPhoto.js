/** 순서 변경은 원래 사진·서버 ID를 유지하고 오래된 드래그 결과로 사진을 잃지 않는다. */
export function reorderFeedPhotos(images, order) {
    if (images.length !== order.length || new Set(order).size !== images.length) return images;
    const byId = new Map(images.map(image => [image.uid, image]));
    const next = order.map(uid => byId.get(uid));
    return next.every(Boolean) ? next : images;
}

/* 미리보기·업로드 전에 WebP로 변환해도 서버에서 독립적으로 해독·검증한다. */
export async function prepareFeedPhoto(file, maxBytes) {
    if (file.type !== 'image/webp') return file;
    if (typeof createImageBitmap !== 'function') throw new Error('이 브라우저에서는 WebP 변환을 지원하지 않아요. JPG나 PNG 사진을 선택해주세요.');
    const bitmap = await createImageBitmap(file);
    try {
        if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 20_000_000) throw new Error('사진 해상도가 너무 커요. 작은 사진을 선택해주세요.');
        const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('사진을 변환하지 못했어요. JPG나 PNG 사진을 선택해주세요.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob || blob.size > maxBytes) throw new Error('변환한 사진이 너무 커요. 작은 사진을 선택해주세요.');
        return new File([blob], 'feed-photo.jpg', { type: 'image/jpeg' });
    } finally { bitmap.close(); }
}
