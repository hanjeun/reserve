import { OWNER_STORE_SORT_OPTIONS, PUBLIC_STORE_SORT_OPTIONS } from '../constants/api';
import { SERVICE_DOMAIN_OPTIONS } from '../constants/categories';
import { REGION_OPTIONS } from '../constants/regions';
import { RESERVATION_SORT_OPTIONS, RESERVATION_STATUS_FILTER_OPTIONS } from '../constants/status';
import { hasDistanceCoordinates } from './distanceSort';
import { WAITING_STORE_STATUSES, WAITING_STORE_SORTS } from '../components/waiting/waitingDirectoryFilters';
import { STORE_NEWS_TYPES } from './storeNews';
import { feedRegion } from './feed';
import { VIEW_MODES } from './viewMode';

const valuesOf = options => new Set(options.map(option => option.value));
const domains = valuesOf(SERVICE_DOMAIN_OPTIONS);
const ownerSorts = valuesOf(OWNER_STORE_SORT_OPTIONS);
const publicSorts = valuesOf(PUBLIC_STORE_SORT_OPTIONS);
const reservationSorts = valuesOf(RESERVATION_SORT_OPTIONS);
const reservationStatuses = valuesOf(RESERVATION_STATUS_FILTER_OPTIONS);
const regions = new Set([
    ...REGION_OPTIONS.flatMap(({ value, label }) => label.endsWith('시')
        ? [value, label, `${value}시`] : [value, label]),
    '강원도', '전라북도', '제주도',
]);
const isRegion = value => {
    const parts = value.trim().split(/\s+/);
    return parts.length <= 2 && regions.has(parts[0]);
};
const isPage = value => /^[1-9]\d*$/.test(value)
    && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647;
const schemas = {
    '/my-stores': { view: VIEW_MODES, domain: domains, sort: ownerSorts },
    '/my-favorites': { view: VIEW_MODES, kind: new Set(['all', 'stores', 'posts', 'news', 'comments']) },
    '/my-reservations': { view: VIEW_MODES, status: reservationStatuses, sort: reservationSorts,
        tab: new Set(['reservation', 'waiting']), waitingPage: value => isPage(value) && Number(value) <= 100_000,
        waitingStatus: new Set(['ALL', 'WAITING', 'CALLED', 'SEATED', 'CANCELLED']),
        waitingSort: new Set(['recent', 'oldest']), waitingKeyword: value => value.length <= 100 },
    '/stores': { view: VIEW_MODES, keyword: null, domain: domains, sort: publicSorts,
        region: isRegion, page: isPage, lat: null, lng: null },
    '/waiting': { view: VIEW_MODES, keyword: null, status: valuesOf(WAITING_STORE_STATUSES),
        sort: valuesOf(WAITING_STORE_SORTS), region: isRegion,
        page: value => isPage(value) && Number(value) <= 100_000 },
    '/benefits': { newsType: new Set(['ALL', ...STORE_NEWS_TYPES.map(option => option.value)]),
        period: new Set(['ONGOING', 'ALL']), page: value => isPage(value) && Number(value) <= 10_000 },
    '/feed': { view: new Set(['all', 'favorites', 'mine', 'drafts']), region: value => feedRegion(value) !== null,
        page: value => isPage(value) && Number(value) <= 10_000 },
    '/feed/u/:publicId': { page: value => isPage(value) && Number(value) <= 10_000 },
    '/feed/notifications': { view: new Set(['all', 'unread']), page: value => isPage(value) && Number(value) <= 10_000 },
};
const defaults = {
    '/my-stores': { view: 'cards', sort: 'recent', domain: '' },
    '/my-favorites': { view: 'cards', kind: 'all' },
    '/my-reservations': { view: 'list', tab: 'reservation' },
    '/stores': { view: 'cards', sort: 'recommended', domain: '', page: '1' },
    '/waiting': { view: 'cards', status: 'ALL', sort: 'recommended', page: '1' },
    '/benefits': { newsType: 'ALL', period: 'ONGOING', page: '1' },
    '/feed': { view: 'all', page: '1' },
    '/feed/u/:publicId': { page: '1' },
    '/feed/notifications': { view: 'all', page: '1' },
};
const isAttribution = key => /^(utm_(source|medium|campaign|term|content|id)|gclid|fbclid)$/.test(key);

/** Recover list options without turning an otherwise valid page into an error screen. */
export function normalizeListQueryParams(pathname, searchParams) {
    const next = new URLSearchParams(searchParams);
    const normalizedPath = pathname.replace(/\/+$/, '').toLowerCase();
    const path = /^\/feed\/u\/[^/]+$/.test(normalizedPath) ? '/feed/u/:publicId' : normalizedPath;
    const schema = schemas[path];
    if (!schema) return next;
    const defaultValues = { ...defaults[path] };
    if (path === '/my-reservations') {
        Object.assign(defaultValues, next.get('tab') === 'waiting'
            ? { waitingStatus: 'ALL', waitingSort: 'recent', waitingPage: '1' }
            : { status: 'ALL', sort: 'recent' });
    }
    if (path === '/feed' && !['mine', 'drafts'].includes(next.get('view'))) defaultValues.region = '';
    for (const key of new Set(next.keys())) {
        if (isAttribution(key)) continue;
        const value = next.get(key);
        const rule = schema[key];
        // 지역 기억값과 구분되는 명시적 전체 선택(region=)은 빈 필터가 아니다.
        const emptySelection = value === '' && (defaultValues[key] === ''
            || key === 'region' && (path === '/stores' || path === '/waiting'));
        const valid = Object.hasOwn(schema, key) && (emptySelection || value !== ''
            && (rule == null || (rule instanceof Set ? rule.has(value) : rule(value))));
        if (!valid) next.delete(key);
        else next.set(key, value); // Keep one value for each supported option.
    }
    if (Object.hasOwn(schema, 'lat') && !hasDistanceCoordinates(next.get('lat'), next.get('lng'))) {
        next.delete('lat');
        next.delete('lng');
    }
    for (const [key, value] of Object.entries(defaultValues)) {
        if (!next.has(key)) next.set(key, value);
    }
    return next;
}
