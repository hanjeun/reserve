import chatService from '../services/chatService';

const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const CHAT_IMAGE_PATH = /^\/api\/(?:v1\/)?(?:chat\/images\/[1-9]\d*|admin\/chat\/reports\/[1-9]\d*\/images\/[1-9]\d*)$/;

function downloadFilename(originalFilename, contentType, messageId) {
    const extension = IMAGE_EXTENSIONS[contentType];
    const fallback = `reserve-chat-photo-${messageId}.${extension}`;
    if (typeof originalFilename !== 'string') return fallback;
    let name = originalFilename.split(/[\\/]/).pop()
        .replace(/[\p{Cc}\p{Cs}\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
        .replace(/[<>:"|?*]/g, '_').trim().replace(/[. ]+$/, '');
    let suffix = `.${extension}`;
    const dot = name.lastIndexOf('.');
    if (dot >= 0) {
        const declaredExtension = name.slice(dot + 1).toLowerCase();
        if (declaredExtension === extension || (contentType === 'image/jpeg' && declaredExtension === 'jpeg')) suffix = name.slice(dot);
        name = name.slice(0, dot);
    }
    name = name.replace(/^\.+/, '').trim();
    if (!name) return fallback;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) name = `_${name}`;
    let base = '';
    let bytes = 0;
    for (const char of name) {
        const codePoint = char.codePointAt(0);
        const size = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
        if (bytes + size > 255 - suffix.length) break;
        bytes += size;
        base += char;
    }
    return base + suffix;
}

/** Preview and download both use the authenticated participant/evidence image endpoint. */
export async function getChatImageBlob(url, signal) {
    if (typeof url !== 'string' || !CHAT_IMAGE_PATH.test(url)) throw new Error('사진 주소를 확인할 수 없어요.');
    const blob = await chatService.getImage(url, signal);
    if (!(blob instanceof Blob) || !IMAGE_EXTENSIONS[blob.type] || blob.size === 0 || blob.size > 8 * 1024 * 1024) {
        throw new Error('사진 응답 형식이 올바르지 않아요.');
    }
    return blob;
}

export async function downloadChatImage(url, signal, isCurrent, originalFilename) {
    if (signal.aborted || !isCurrent()) return;
    const blob = await getChatImageBlob(url, signal);
    if (signal.aborted || !isCurrent()) return;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = downloadFilename(originalFilename, blob.type, url.split('/').pop());
    try {
        document.body.append(link);
        if (!signal.aborted && isCurrent()) link.click();
    } finally {
        link.remove();
        // Let the browser consume the Blob, then release its temporary URL.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
}
