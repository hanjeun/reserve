const URL_FIELDS = new Set(['url', 'href', 'from', 'to', 'filename', 'abs_path', 'url.full', 'http.url']);
const PRIVATE_URL_FIELDS = new Set(['url.query', 'url.fragment', 'http.query', 'http.fragment', 'query_string']);
const stripUrlDetails = value => value.split(/[?#]/, 1)[0];
const hasUrlDetails = value => typeof value === 'string' && /[?#]/.test(value);

function scrub(value, key = '', seen = new WeakMap()) {
    if (PRIVATE_URL_FIELDS.has(key)) return '[Filtered]';
    if (typeof value === 'string') {
        if (URL_FIELDS.has(key) || /^(?:[a-z][a-z0-9+.-]*:\/\/|\/)/i.test(value)) return stripUrlDetails(value);
        return value.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, stripUrlDetails);
    }
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const result = Array.isArray(value) ? [] : {};
    seen.set(value, result);
    for (const [field, item] of Object.entries(value)) {
        if (field !== '__proto__') result[field] = scrub(item, field, seen);
    }
    return result;
}

export function createTelemetryPrivacy(getPageUrl = () => globalThis.location?.href) {
    let privatePageVisited = hasUrlDetails(getPageUrl());
    const observeNavigation = breadcrumb => {
        if (breadcrumb?.category === 'navigation') {
            privatePageVisited ||= hasUrlDetails(breadcrumb.data?.from) || hasUrlDetails(breadcrumb.data?.to);
        }
    };
    const processEvent = event => {
        privatePageVisited ||= hasUrlDetails(getPageUrl());
        if (event.type === 'replay_event') {
            privatePageVisited ||= event.urls?.some(hasUrlDetails) === true;
            // Replay 원본 메타데이터는 사용자 콜백을 거치지 않아 URL 정보가 있던 문서의 녹화는 전송하지 않는다.
            if (privatePageVisited) return null;
        }
        return scrub(event);
    };
    return {
        integration: { name: 'ReserveTelemetryPrivacy', processEvent },
        beforeSend: processEvent,
        beforeBreadcrumb: breadcrumb => { observeNavigation(breadcrumb); return scrub(breadcrumb); },
        beforeAddRecordingEvent: event => {
            if (event.data?.tag === 'breadcrumb') observeNavigation(event.data.payload);
            return scrub(event);
        },
    };
}

export const telemetryPrivacy = createTelemetryPrivacy();
