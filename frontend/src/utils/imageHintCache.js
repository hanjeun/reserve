import { imageDimensions } from './imageDimensions';
import { storeCoverImage, storeGalleryLayoutRatio } from './storeImages';

// Only public photo identity and intrinsic dimensions survive a reload, never store/profile data.
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
    catch { /* The loading layout still works when session storage is unavailable. */ }
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

/** Match the public document's exact store and managed photo path, independently of OG thumbnails. */
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

/** A new public response replaces or invalidates the old photo hint, including missing metadata. */
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

/** Fresh document metadata wins over an older browser hint until a public API response supersedes it. */
export const getImageHint = storeId => {
    const id = storeKey(storeId);
    if (!id) return null;
    const initial = initialImageHint(id);
    if (initial) return geometryHint(initial);
    const cached = load()[id];
    // Old dimension-only entries cannot identify a changed photo and are deliberately ignored.
    return typeof cached?.url === 'string' && cached.url ? geometryHint(cached) : null;
};
