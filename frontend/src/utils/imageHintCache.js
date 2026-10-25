import { imageDimensions } from './imageDimensions';
import { storeCoverImage, storeGalleryLayoutRatio } from './storeImages';

// 공개 사진 식별자·원본 크기만 복구하며 가게·프로필 데이터는 저장하지 않는다.
const KEY = 'reserve:storeImageHints';
const MAX_ENTRIES = 300;
let memoryCache = null;
const supersededHtml = new Set();
const storeKey = value => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? String(Number(value)) : null;
const load = () => {
    if (memoryCache) return memoryCache;
    try {
        const parsed = JSON.parse(sessionStorage.getItem(KEY) || '{}');
        memoryCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { memoryCache = {}; }
    return memoryCache;
};
const persist = () => {
    try { sessionStorage.setItem(KEY, JSON.stringify(memoryCache)); }
    catch { /* 세션 저장소를 쓸 수 없어도 기본 로딩 배치를 유지한다. */ }
};

const geometryHint = image => {
    const size = imageDimensions(image);
    if (!size) return null;
    const ratio = image.layoutRatio;
    return Number.isFinite(ratio) && ratio > 0 && ratio <= size.width / size.height
        ? { ...size, layoutRatio: ratio } : size;
};
export const extractImageHint = store => {
    const cover = storeCoverImage(store);
    return cover ? geometryHint({ ...cover, layoutRatio: storeGalleryLayoutRatio(store) }) : null;
};

/* OG 축소판과 분리해 같은 가게·관리 사진 경로의 공개 문서 힌트만 사용한다. */
const initialImageHint = id => {
    if (typeof document === 'undefined' || supersededHtml.has(id)) return null;
    const content = suffix => document.querySelector('meta[name="reserve-store-image-' + suffix + '"]')?.content;
    if (storeKey(content('id')) !== id) return null;
    const size = imageDimensions({ width: Number(content('width')), height: Number(content('height')) });
    if (!size) return null;
    try {
        const value = content('url');
        const url = new URL(value);
        const path = decodeURIComponent(url.pathname);
        if (url.protocol !== 'https:' || !['cdn.reserve.it.kr', 'reserve.it.kr', 'app.reserve.it.kr'].includes(url.hostname)
            || url.username || url.password || url.port || url.search || url.hash || path.includes('\\')
            || !new RegExp('^/users/[0-9]+/stores/' + id + '/(?:images|thumbnails)/[^/]+$').test(path)) return null;
        return { url: value, ...geometryHint({ ...size, layoutRatio: Number(content('layout-ratio')) }) };
    } catch { return null; }
};

export const forgetImageHint = storeId => {
    const id = storeKey(storeId);
    if (!id) return;
    supersededHtml.add(id);
    const cache = load();
    if (Object.hasOwn(cache, id)) { delete cache[id]; persist(); }
};

/* 새 공개 응답에서 메타데이터가 빠지면 이전 사진 힌트도 폐기한다. */
export const rememberImageHints = stores => {
    const cache = load();
    let changed = false;
    for (const store of Array.isArray(stores) ? stores : [stores]) {
        const id = storeKey(store?.id);
        if (!id) continue;
        supersededHtml.add(id);
        const image = storeCoverImage(store);
        const hint = extractImageHint(store);
        if (!hint || typeof image.url !== 'string' || !image.url) {
            if (Object.hasOwn(cache, id)) { delete cache[id]; changed = true; }
            continue;
        }
        const previous = cache[id];
        if (previous?.url === image.url && previous.width === hint.width && previous.height === hint.height
            && previous.layoutRatio === hint.layoutRatio) continue;
        cache[id] = { url: image.url, ...hint };
        changed = true;
    }
    if (!changed) return;
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) keys.slice(0, keys.length - MAX_ENTRIES).forEach(id => delete cache[id]);
    persist();
};

/* 새 공개 API 응답 전까지 문서 메타데이터를 브라우저 힌트보다 우선한다. */
export const getImageHint = storeId => {
    const id = storeKey(storeId);
    if (!id) return null;
    const initial = initialImageHint(id);
    if (initial) return geometryHint(initial);
    const cached = load()[id];
    // 사진을 식별하지 못하는 크기 전용 이전 항목은 사용하지 않는다.
    return typeof cached?.url === 'string' && cached.url ? geometryHint(cached) : null;
};
