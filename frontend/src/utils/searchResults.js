import { SEARCH_GROUP_LIMIT } from '../constants/searchCatalog';

export const positiveSearchId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value)
    && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const types = { stores: 'STORE', benefits: 'BENEFIT', feed: 'FEED', reservations: 'RESERVATION', waiting: 'WAITING', messages: 'MESSAGE' };
const titles = { stores: '가게', benefits: '혜택', feed: '피드', reservations: '내 예약', waiting: '내 웨이팅', messages: '메시지' };

export function isSearchResultPath(key, item, role) {
    if (!Number.isSafeInteger(item?.id) || item.id <= 0 || typeof item.path !== 'string' || item.type !== types[key]) return false;
    if (key === 'stores') return item.path === `/store/${item.id}`;
    if (key === 'benefits') return item.path === `/benefits/${item.id}`;
    if (key === 'feed') return item.path === `/feed/posts/${item.id}`;
    if (key === 'reservations') return item.path === `/my-reservations?reservationId=${item.id}`;
    if (key === 'waiting') return item.path === `/my-reservations?tab=waiting&entryId=${item.id}`;
    if (key !== 'messages') return false;
    if (item.path === '/messages?kind=support') return true;
    const match = /^\/messages\?(storeId|ownerRoomId)=([1-9]\d*)$/.exec(item.path);
    return Boolean(match && positiveSearchId(match[2]) && (match[1] !== 'ownerRoomId' || ['BUSINESS', 'ADMIN'].includes(role)));
}

/* 알 수 없는 경로·식별자 불일치·잘못된 응답을 이동 대상으로 사용하지 않는다. */
export function normalizeSearchResponse(response, keyword, keys, role) {
    if (response?.keyword !== keyword || !Array.isArray(response.groups)) {
        const error = new Error('검색 응답 형식을 확인할 수 없어요.');
        error.isInvalidSearchResponse = true;
        throw error;
    }
    return { keyword, groups: keys.map(key => {
        const matches = response.groups.filter(group => group?.key === key);
        const group = matches.length === 1 ? matches[0] : null;
        const malformed = !group || !Array.isArray(group.items) || group.items.length > SEARCH_GROUP_LIMIT
            || typeof group.hasMore !== 'boolean' || group.error != null && group.error.status !== 503
            || group.items.some(item => !isSearchResultPath(key, item, role) || typeof item.title !== 'string' || !item.title.trim()
                || item.title.length > 300 || item.description != null && typeof item.description !== 'string');
        if (malformed) return { key, title: titles[key], items: [], hasMore: false,
            error: { status: 503, message: '검색 결과를 확인할 수 없어요. 다시 시도해주세요.' } };
        return { key, title: titles[key], hasMore: group.hasMore, error: group.error ? { status: 503 } : null,
            items: group.items.map(item => ({ id: item.id, type: item.type, title: item.title,
                description: item.description?.slice(0, 200) ?? '', path: item.path })) };
    }) };
}

export function parseSearchMessageTarget(params, role) {
    if (params.getAll('storeId').length > 1 || params.getAll('ownerRoomId').length > 1 || params.getAll('kind').length > 1) return null;
    const present = ['storeId', 'ownerRoomId', 'kind'].filter(key => params.has(key));
    if (present.length !== 1) return null;
    const storeId = positiveSearchId(params.get('storeId'));
    if (storeId) return { kind: 'store', storeId };
    const roomId = positiveSearchId(params.get('ownerRoomId'));
    if (roomId && ['BUSINESS', 'ADMIN'].includes(role)) return { kind: 'owner', roomId };
    return params.get('kind') === 'support' ? { kind: 'support' } : null;
}
