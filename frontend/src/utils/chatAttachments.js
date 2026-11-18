const PHOTO_TYPES = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/gif': ['gif'],
};

export const CHAT_PHOTO_ACCEPT = Object.keys(PHOTO_TYPES).join(',');
export const CHAT_DOCUMENT_ACCEPT = '.pdf,.txt';
export const CHAT_ATTACHMENT_LIMIT = 3;
export const CHAT_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const CHAT_DOCUMENT_MAX_BYTES = 7 * 1024 * 1024;

const extensionOf = name => name?.split('.').slice(1).at(-1)?.toLowerCase();

export function chatAttachmentKind(file) {
    const extension = extensionOf(file?.name);
    if (extension === 'pdf' || extension === 'txt') return 'document';
    if (Object.hasOwn(PHOTO_TYPES, file?.type)) return 'photo';
    if (!file?.type || file.type === 'application/octet-stream') {
        if (Object.values(PHOTO_TYPES).some(extensions => extensions.includes(extension))) return 'photo';
    }
    return null;
}

export function chatAttachmentError(selected, currentCount, { documentsEnabled, photoMax, documentMax }) {
    if (currentCount + selected.length > CHAT_ATTACHMENT_LIMIT) return `첨부는 ${CHAT_ATTACHMENT_LIMIT}개까지 할 수 있어요.`;
    for (const file of selected) {
        const kind = chatAttachmentKind(file);
        if (!kind || (kind === 'document' && !documentsEnabled)) {
            return documentsEnabled ? 'JPG, PNG, WEBP, GIF 사진이나 PDF, TXT 문서를 선택해주세요.'
                : 'JPG, PNG, WEBP, GIF 사진을 선택해주세요.';
        }
        if (file.size === 0) return '비어 있는 파일은 첨부할 수 없어요.';
        const limit = kind === 'photo' ? photoMax : documentMax;
        if (file.size > limit) {
            return `${kind === 'photo' ? '사진은' : '문서는'} ${Math.floor(limit / (1024 * 1024))}MB 이하로 첨부해주세요.`;
        }
    }
    return '';
}

export function filesFromTransfer(transfer) {
    if (transfer?.files?.length) return Array.from(transfer.files);
    return Array.from(transfer?.items ?? []).filter(item => item.kind === 'file')
        .map(item => item.getAsFile()).filter(Boolean);
}

export const hasFileTransfer = transfer => Array.from(transfer?.types ?? []).includes('Files')
    || Boolean(transfer?.files?.length);

export function formatChatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
