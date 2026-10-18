import { imageFileError, MAX_IMAGE_REQUEST_BYTES } from './imageUploadPolicy';
import { importStoreDraftRecords, listStoreDrafts } from './storeDraftStorage';
import { assertCurrentSession } from '../api/sessionScope';

export const MAX_DRAFT_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_PHOTO_BYTES = 48 * 1024 * 1024;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const invalid = () => new Error('RESERVE 임시저장 파일 형식이나 내용이 올바르지 않아요.');
const safeValues = (value, depth = 0) => {
    if (depth > 8) throw invalid();
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.length <= 20_000) return value;
    if (Array.isArray(value) && value.length <= 100) return value.map(item => safeValues(item, depth + 1));
    if (plain(value) && Object.keys(value).length <= 200) {
        const result = {};
        for (const [key, item] of Object.entries(value)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key) || key.length > 100) throw invalid();
            result[key] = safeValues(item, depth + 1);
        }
        return result;
    }
    throw invalid();
};
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
const base64 = bytes => {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
};
const existingImage = value => {
    if (typeof value !== 'string' || value.length > 1000 || value.includes('\\')
        || Array.from(value).some(character => character.charCodeAt(0) < 32)) throw invalid();
    const url = new URL(value, window.location.origin);
    const sameLocal = import.meta.env.DEV && url.origin === window.location.origin;
    if (!sameLocal && (url.protocol !== 'https:' || !['cdn.reserve.it.kr', 'reserve.it.kr', 'app.reserve.it.kr'].includes(url.hostname))) throw invalid();
    if (url.username || url.password || url.search || url.hash || /(?:chat|feed|verification|certificate|private)/i.test(url.pathname)) throw invalid();
    if (value.startsWith('/') && !value.startsWith('/uploads/')) throw invalid();
    return value;
};
const photoSignature = (bytes, type) => {
    const text = (from, count) => String.fromCharCode(...bytes.subarray(from, from + count));
    return type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : type === 'image/png' ? bytes[0] === 137 && text(1, 3) === 'PNG'
            : type === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(text(0, 6))
                : type === 'image/webp' && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP';
};
export async function exportStoreDraftArchive(memberId, keys, session) {
    assertCurrentSession(session);
    const records = (await listStoreDrafts(memberId)).filter(record => keys.includes(record.key));
    if (!records.length || records.length > 50) throw new Error('내보낼 임시저장을 1~50개 선택해주세요.');
    let total = 0;
    const encode = async image => {
        if (image.kind === 'existing') return { kind: 'existing', uid: image.uid, name: image.name, existingUrl: existingImage(image.existingUrl) };
        if (image.kind !== 'local' || !(image.file instanceof Blob)) throw invalid();
        total += image.file.size;
        if (total > MAX_PHOTO_BYTES) throw new Error('선택한 사진 합계가 48MB를 넘어요. 임시저장을 나누어 내보내주세요.');
        const bytes = new Uint8Array(await image.file.arrayBuffer());
        assertCurrentSession(session);
        const name = image.name || image.file.name || 'photo.jpg';
        const inferredType = /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : /\.gif$/i.test(name) ? 'image/gif' : 'image/jpeg';
        return { kind: 'local', uid: image.uid, name, type: image.type || image.file.type || inferredType,
            lastModified: image.lastModified || Date.now(), size: bytes.length, sha256: await digest(bytes), data: base64(bytes) };
    };
    const drafts = [];
    for (const record of records) drafts.push({ ...record, values: safeValues(record.values),
        mainImage: await Promise.all(record.mainImage.map(encode)), detailImages: await Promise.all(record.detailImages.map(encode)) });
    assertCurrentSession(session);
    const blob = new Blob([JSON.stringify({ format: 'reserve-store-drafts', version: 1, memberId: String(memberId), exportedAt: new Date().toISOString(), drafts })], { type: 'application/json' });
    if (blob.size > MAX_DRAFT_ARCHIVE_BYTES) throw new Error('파일이 64MB를 넘어요. 임시저장을 나누어 내보내주세요.');
    return blob;
}
export async function parseStoreDraftArchive(file, memberId, session) {
    if (!(file instanceof Blob) || file.size <= 0 || file.size > MAX_DRAFT_ARCHIVE_BYTES) throw new Error('64MB 이하의 임시저장 JSON 파일을 선택해주세요.');
    const archive = JSON.parse(await file.text());
    assertCurrentSession(session);
    if (!plain(archive) || archive.format !== 'reserve-store-drafts' || archive.version !== 1 || !Array.isArray(archive.drafts) || archive.drafts.length > 50) throw invalid();
    if (archive.memberId !== String(memberId)) throw new Error('내보낸 계정과 같은 계정으로 로그인한 뒤 가져와주세요.');
    const allowedKey = new RegExp(`^member:${Number(memberId)}:store:(register:new|create:new|edit:[1-9]\\d*)$`);
    let total = 0;
    const decode = async image => {
        if (!plain(image) || typeof image.uid !== 'string' || image.uid.length > 100 || typeof image.name !== 'string' || image.name.length > 255) throw invalid();
        if (image.kind === 'existing') return { kind: 'existing', uid: image.uid, name: image.name, existingUrl: existingImage(image.existingUrl) };
        if (image.kind !== 'local' || !Number.isSafeInteger(image.size) || image.size <= 0 || image.size > MAX_IMAGE_REQUEST_BYTES
            || typeof image.data !== 'string' || image.data.length > Math.ceil(MAX_IMAGE_REQUEST_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)) throw invalid();
        total += image.size; if (total > MAX_PHOTO_BYTES) throw invalid();
        const binary = atob(image.data); if (binary.length !== image.size) throw invalid();
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        if (!photoSignature(bytes, image.type) || await digest(bytes) !== image.sha256) throw new Error('사진 내용이 바뀌었거나 파일이 손상됐어요. 다시 내보내주세요.');
        assertCurrentSession(session);
        const photo = new File([bytes], image.name, { type: image.type, lastModified: Number.isFinite(image.lastModified) ? image.lastModified : Date.now() });
        if (imageFileError(photo)) throw invalid();
        return { kind: 'local', uid: image.uid, name: image.name, type: image.type, lastModified: photo.lastModified, file: photo };
    };
    const result = [];
    for (const record of archive.drafts) {
        if (!plain(record) || !plain(record.values) || record.schemaVersion !== 1 || !allowedKey.test(record.key) || !Number.isSafeInteger(record.savedAt) || !Number.isSafeInteger(record.expiresAt)
            || record.savedAt > Date.now() + 60_000 || record.expiresAt < record.savedAt || record.expiresAt - record.savedAt > 30 * 86400_000
            || !Array.isArray(record.mainImage) || record.mainImage.length > 1 || !Array.isArray(record.detailImages) || record.detailImages.length > 5
            || record.baseFingerprint != null && (typeof record.baseFingerprint !== 'string' || record.baseFingerprint.length > 200_000)) throw invalid();
        if (record.expiresAt <= Date.now()) continue;
        const mainImage = await Promise.all(record.mainImage.map(decode));
        const detailImages = await Promise.all(record.detailImages.map(decode));
        if ([...mainImage, ...detailImages].reduce((bytes, item) => bytes + (item.file?.size || 0), 0) > MAX_IMAGE_REQUEST_BYTES) throw invalid();
        result.push({ key: record.key, schemaVersion: 1, savedAt: record.savedAt, expiresAt: record.expiresAt,
            baseFingerprint: record.baseFingerprint || null, values: safeValues(record.values), mainImage, detailImages });
    }
    if (new Set(result.map(record => record.key)).size !== result.length) throw invalid();
    return result;
}
export async function restoreStoreDraftArchive(records, overwrite, session) {
    assertCurrentSession(session);
    await importStoreDraftRecords(records, overwrite, () => assertCurrentSession(session));
    assertCurrentSession(session);
}
