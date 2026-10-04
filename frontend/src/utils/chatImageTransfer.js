import chatService from '../services/chatService';

const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const CHAT_IMAGE_PATH = /^\/api\/(?:v1\/)?(?:chat\/images\/[1-9]\d*|admin\/chat\/reports\/[1-9]\d*\/images\/[1-9]\d*)$/;

/** Preview and download both use the authenticated participant/evidence image endpoint. */
export async function getChatImageBlob(url, signal) {
    if (typeof url !== 'string' || !CHAT_IMAGE_PATH.test(url)) throw new Error('사진 주소를 확인할 수 없습니다.');
    const blob = await chatService.getImage(url, signal);
    if (!(blob instanceof Blob) || !IMAGE_EXTENSIONS[blob.type] || blob.size === 0 || blob.size > 8 * 1024 * 1024) {
        throw new Error('사진 응답 형식이 올바르지 않습니다.');
    }
    return blob;
}

export async function downloadChatImage(url, signal, isCurrent) {
    if (signal.aborted || !isCurrent()) return;
    const blob = await getChatImageBlob(url, signal);
    if (signal.aborted || !isCurrent()) return;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `reserve-chat-photo-${url.split('/').pop()}.${IMAGE_EXTENSIONS[blob.type]}`;
    try {
        document.body.append(link);
        if (!signal.aborted && isCurrent()) link.click();
    } finally {
        link.remove();
        // Let the browser consume the Blob, then release its temporary URL.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
}
