import { OWNER_STORE_SORT_OPTIONS, PUBLIC_STORE_SORT_OPTIONS } from '../constants/api';
import { SERVICE_DOMAIN_OPTIONS } from '../constants/categories';
import { REGION_OPTIONS } from '../constants/regions';
import { RESERVATION_SORT_OPTIONS, RESERVATION_STATUS_FILTER_OPTIONS } from '../constants/status';
import { hasDistanceCoordinates } from './distanceSort';

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
    '/my-stores': { view: null, domain: domains, sort: ownerSorts },
    '/my-favorites': { view: null },
    '/my-reservations': { view: null, status: reservationStatuses, sort: reservationSorts,
        tab: new Set(['reservation', 'waiting']), waitingPage: value => isPage(value) && Number(value) <= 100_000,
        waitingStatus: new Set(['ALL', 'WAITING', 'CALLED', 'SEATED', 'CANCELLED']),
        waitingSort: new Set(['recent', 'oldest']), waitingKeyword: value => value.length <= 100 },
    '/stores': { view: null, keyword: null, domain: domains, sort: publicSorts,
        region: isRegion, page: isPage, lat: null, lng: null },
};
const isAttribution = key => /^(utm_(source|medium|campaign|term|content|id)|gclid|fbclid)$/.test(key);

/** Recover list options without turning an otherwise valid page into an error screen. */
export function normalizeListQueryParams(pathname, searchParams) {
    const next = new URLSearchParams(searchParams);
    const schema = schemas[pathname.replace(/\/+$/, '').toLowerCase()];
    if (!schema) return next;
    for (const key of new Set(next.keys())) {
        if (isAttribution(key)) continue;
        const value = next.get(key);
        const rule = schema[key];
        const valid = Object.hasOwn(schema, key) && value !== ''
            && (rule == null || (rule instanceof Set ? rule.has(value) : rule(value)));
        if (!valid) next.delete(key);
        else next.set(key, value); // Keep one value for each supported option.
    }
    if (Object.hasOwn(schema, 'lat') && !hasDistanceCoordinates(next.get('lat'), next.get('lng'))) {
        next.delete('lat');
        next.delete('lng');
    }
    return next;
}
