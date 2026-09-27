export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const MAX_IMAGE_REQUEST_MB = 8;
export const MAX_IMAGE_REQUEST_BYTES = MAX_IMAGE_REQUEST_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXTENSION = /\.(jpe?g|png|webp|gif)$/i;

export const imageFileError = (file, maxBytes = MAX_IMAGE_REQUEST_BYTES) => {
    if (!file) return '이미지 파일을 선택해주세요.';
    const hasAllowedType = ALLOWED_MIME_TYPES.has(file.type);
    const hasAllowedExtension = ALLOWED_EXTENSION.test(file.name ?? '');
    const hasDeclaredType = Boolean(file.type);
    const hasExtension = /\.[^.]+$/.test(file.name ?? '');
    if ((!hasAllowedType && !hasAllowedExtension)
        || (hasDeclaredType && !hasAllowedType)
        || (hasExtension && !hasAllowedExtension)) {
        return 'JPG · PNG · WEBP · GIF 이미지만 업로드할 수 있습니다.';
    }
    if (file.size > maxBytes) {
        return `파일 크기는 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하여야 합니다.`;
    }
    return null;
};

export const uploadListBytes = (fileList = []) => fileList.reduce(
    (total, item) => total + Number(item?.originFileObj?.size ?? item?.size ?? 0),
    0,
);
