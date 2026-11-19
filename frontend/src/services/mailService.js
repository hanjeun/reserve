import api from '../api/axios';

export async function previewMailDraft(endpoint, request, signal) {
    const result = await api.post(endpoint, request, { signal });
    if (typeof result?.html !== 'string' || !result.html.startsWith('<!DOCTYPE html>')) {
        throw new Error('메일 미리보기를 불러오지 못했어요. 다시 시도해주세요.');
    }
    return result.html;
}

export function sendMailDraft(endpoint, request, photos) {
    if (!photos.length) return api.post(endpoint, request);
    const data = new FormData();
    data.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));
    for (const photo of photos) data.append('photos', photo);
    return api.post(endpoint, data);
}
