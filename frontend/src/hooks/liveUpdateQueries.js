const DOMAINS = new Set(['NEWS', 'WAITING', 'FEED', 'COMMENT', 'LIKE', 'NOTIFICATION', 'STORE', 'REVIEW', 'FAVORITE', 'RESERVATION']);
const OPERATIONS = new Set(['CREATED', 'UPDATED', 'DELETED', 'INVALIDATED']);
const same = (a, b) => a != null && b != null && String(a) === String(b);
const affected = (value, id) => !id || same(value, id);
const forStore = (params, id) => !id || !params?.storeId || params.storeId === 'ALL' || same(params.storeId, id);

/** Events carry identifiers, never authoritative content or a form's concurrency version. */
export function parseLiveUpdate(raw) {
    let event;
    try { event = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    if (!event || !DOMAINS.has(event.domain) || !OPERATIONS.has(event.operation)
        || typeof event.epoch !== 'string' || !event.epoch.length || event.epoch.length > 80
        || !Number.isSafeInteger(event.revision) || event.revision < 1
        || event.eventId !== `${event.epoch}:${event.revision}`
        || !Number.isSafeInteger(event.entityId) || event.entityId < 0
        || event.entityId === 0 && event.operation !== 'INVALIDATED'
        || event.targetType != null && !['POST', 'NEWS', 'COMMENT'].includes(event.targetType)) return null;
    for (const key of ['parentId', 'storeId']) {
        if (event[key] != null && (!Number.isSafeInteger(event[key]) || event[key] < 0)) return null;
    }
    return event;
}

const feedRead = key => key[0] === 'feed' && ['posts', 'post', 'author', 'regions'].includes(key[1]);
const feedOwn = key => key[0] === 'feed' && key[1] === 'me' && key[2] === 'posts';
const interaction = (key, kind) => key[0] === 'feed' && key[1] === 'interactions' && key[2] === kind;
const storeRead = key => key[0] === 'stores' && ['list', 'detail', 'my', 'regions'].includes(key[1]) && !key.includes('edit');
const reservationRead = key => key[0] === 'reservations' && ['my', 'manage'].includes(key[1]);

export function liveUpdateMatches(query, event) {
    const key = query.queryKey;
    const { domain, entityId: id, parentId, storeId } = event;
    if (domain === 'NEWS') {
        if (event.targetType) return interaction(key, 'status') && key[3] === 'NEWS' && affected(key[4], id)
            || key[0] === 'public-promotions' && (key[1] === 'list' || key[1] === 'detail' && affected(key[2], id))
            || key[0] === 'feed' && key[1] === 'posts';
        if (key[0] === 'public-promotions') return key[1] === 'list' || key[1] === 'detail' && affected(key[2], id);
        if (key[0] === 'store-news') {
            if (['application', 'detail'].includes(key[1])) return affected(key[2], id);
            return ['applications', 'me'].includes(key[1]) && forStore(key[2], storeId);
        }
        return interaction(key, 'status') && key[3] === 'NEWS' && affected(key[4], id)
            || interaction(key, 'mine') || key[0] === 'feed' && key[1] === 'posts';
    }
    if (domain === 'WAITING') return key[0] === 'waiting-stores'
        || key[0] === 'waiting' && (key[2] === 'my' || affected(key[2], storeId || id));
    if (domain === 'FEED') {
        if (!event.targetType && (interaction(key, 'mine') || interaction(key, 'notifications')
            || interaction(key, 'comments') && affected(key[3], id))) return true;
        if (feedRead(key)) return key[1] !== 'post' || affected(key[2], id);
        if (feedOwn(key)) return true;
        return interaction(key, 'status') && key[3] === 'POST' && affected(key[4], id);
    }
    if (domain === 'COMMENT') {
        if (!event.targetType && interaction(key, 'notifications')) return true;
        if (interaction(key, 'comments')) return affected(key[3], parentId);
        if (interaction(key, 'replies')) return true; // A reply's parent may have moved outside the loaded page.
        if (interaction(key, 'comment')) return affected(key[3], id);
        if (interaction(key, 'status')) return key[3] === 'COMMENT' && affected(key[4], id)
            || key[3] === 'POST' && affected(key[4], parentId);
        return feedRead(key) && (key[1] !== 'post' || affected(key[2], parentId))
            || interaction(key, 'mine');
    }
    if (domain === 'LIKE') return interaction(key, 'mine')
        || interaction(key, 'status') && (!event.targetType || key[3] === event.targetType) && affected(key[4], id);
    if (domain === 'NOTIFICATION') return interaction(key, 'notifications');
    if (domain === 'STORE') {
        if (storeRead(key)) return key[1] !== 'detail' || affected(key[2], id);
        return key[0] === 'waiting-stores' || key[0] === 'favorites' && key[1] === 'my'
            || key[0] === 'store-news' && key[1] === 'stores';
    }
    if (domain === 'REVIEW') return key[0] === 'reviews' && affected(key[2], storeId || parentId)
        || storeRead(key) && (key[1] !== 'detail' || affected(key[2], storeId || parentId));
    if (domain === 'FAVORITE') return key[0] === 'favorites' && (key[1] === 'my' || affected(key[2], storeId || id))
        || key[0] === 'feed' && key[1] === 'posts' && (key[2]?.favoriteOnly || key[2]?.view === 'favorites');
    if (domain === 'RESERVATION') return reservationRead(key) && (key[1] !== 'manage' || forStore(key[2], storeId));
    return false;
}

/** Reconnect/fallback only reads supported domains; no QR generation, payment or admin audit prefixes. */
export function isLiveReadQuery(query) {
    const key = query.queryKey;
    return feedRead(key) || feedOwn(key) || storeRead(key) || reservationRead(key)
        || key[0] === 'waiting-stores' || key[0] === 'waiting'
        || key[0] === 'reviews' || key[0] === 'favorites'
        || key[0] === 'public-promotions' && ['list', 'detail'].includes(key[1])
        || key[0] === 'store-news' && ['applications', 'application', 'me', 'detail', 'stores'].includes(key[1])
        || key[0] === 'feed' && key[1] === 'interactions' && !['config', 'reports', 'report', 'current'].includes(key[2]);
}

export const queryErrorStatus = error => Number(error?.status ?? error?.response?.status);
export const isReadAccessDenied = error => [401, 403, 404, 410].includes(queryErrorStatus(error));

export function clearDeniedQueryData(error, query) {
    const status = queryErrorStatus(error);
    const key = query.queryKey;
    const entityRead = key[0] === 'feed' && ['post', 'author'].includes(key[1])
        || key[0] === 'feed' && key[1] === 'interactions' && ['comments', 'replies', 'comment', 'status'].includes(key[2])
        || key[0] === 'reservations' && key[1] === 'qrToken' || key[0] === 'waitingQr'
        || ['public-promotions', 'store-news', 'stores'].includes(key[0]) && ['detail', 'application'].includes(key[1]);
    if ([401, 403].includes(status) || [404, 410].includes(status) && entityRead) {
        // Keep the error state: resetting/removing an active query can otherwise start an endless retry loop.
        query.setState({ data: undefined, dataUpdatedAt: 0 });
    }
}

export const LIVE_UPDATE_DOMAINS = [...DOMAINS];

export function nextNewsBoundary(client, now) {
    let next = Infinity;
    for (const query of client.getQueryCache().findAll({ predicate: value => value.isActive()
        && ['public-promotions', 'store-news'].includes(value.queryKey[0]) })) {
        const data = query.state.data;
        const items = [...(Array.isArray(data) ? data : [data]), ...(data?.content || [])];
        for (const item of items) {
            for (const value of [item?.startsAt, item?.endsAt]) {
                const time = Date.parse(value);
                if (time > now && time < next) next = time;
            }
        }
    }
    return Number.isFinite(next) ? next : null;
}

/** If a signal arrives after an in-flight read's snapshot, read once more after that request settles. */
export function createLiveQueryRefresh(client, current) {
    const following = new Map();
    return (events = [], all = false, { periodic = false } = {}) => {
        if (!current()) return;
        const matches = query => {
            const auditRead = query.queryKey[0] === 'store-news'
                && ['applications', 'application'].includes(query.queryKey[1]);
            return isLiveReadQuery(query) && (all && (!periodic || !auditRead)
                || events.some(event => liveUpdateMatches(query, event)));
        };
        const queries = client.getQueryCache().findAll({ predicate: matches });
        void client.invalidateQueries({ predicate: matches, refetchType: 'none' });
        for (const query of queries) {
            if (!query.isActive()) continue;
            const refetch = () => {
                following.delete(query.queryHash);
                if (current() && client.getQueryCache().get(query.queryHash) === query) {
                    void client.refetchQueries({ type: 'active', predicate: value => value === query }, { cancelRefetch: false });
                }
            };
            if (query.state.fetchStatus !== 'idle' && query.promise) {
                if (!following.has(query.queryHash)) {
                    following.set(query.queryHash, true);
                    void query.promise.then(refetch, refetch);
                }
            } else refetch();
        }
    };
}
