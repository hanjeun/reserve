/** The legacy API remains usable while a frontend and backend are rolled out separately. */
export function versionedApiUrl(url, version = import.meta.env.VITE_API_VERSION) {
    if (version !== 'v1' || typeof url !== 'string' || !url.startsWith('/api/')
        || /^\/api\/v\d+(?:\/|$)/.test(url)) return url;
    return `/api/v1${url.slice(4)}`;
}

export function canonicalApiPath(url) {
    if (typeof url !== 'string') return '';
    const path = url.split(/[?#]/, 1)[0];
    return path.replace(/^\/api\/v1(?=\/|$)/, '/api');
}
