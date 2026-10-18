import { describe, expect, it } from 'vitest';
import { normalizeListQueryParams } from '../listQueryParams';

const clean = (pathname, search) => normalizeListQueryParams(pathname, new URLSearchParams(search)).toString();

describe('list URL conventions', () => {
    it.each([
        ['/stores', { view: 'cards', sort: 'recommended', domain: '', page: '1' }],
        ['/my-stores', { view: 'cards', sort: 'recent', domain: '' }],
        ['/my-favorites', { view: 'cards', kind: 'all' }],
        ['/my-reservations', { view: 'list', tab: 'reservation', status: 'ALL', sort: 'recent' }],
        ['/waiting', { view: 'cards', status: 'ALL', sort: 'recommended', page: '1' }],
        ['/benefits', { newsType: 'ALL', period: 'ONGOING', page: '1' }],
        ['/feed', { view: 'all', page: '1', region: '' }],
        ['/feed/u/author-id', { page: '1' }],
    ])('shows every default selection on %s and retains it on refresh', (pathname, expected) => {
        const normalized = normalizeListQueryParams(pathname, new URLSearchParams());
        expect(Object.fromEntries(normalized)).toEqual(expected);
        expect(normalizeListQueryParams(pathname, normalized).toString()).toBe(normalized.toString());
    });

    it.each(['stores', 'posts', 'news'])('retains the unified likes filter %s', kind => {
        expect(clean('/my-favorites', `kind=${kind}&view=list`)).toBe(`kind=${kind}&view=list`);
    });

    it('preserves drafts and an explicit page instead of interpreting feed view as cards/list', () => {
        expect(clean('/feed', 'view=drafts&page=3&utm_source=guide')).toBe('view=drafts&page=3&utm_source=guide');
        expect(clean('/benefits', 'newsType=EVENT&period=ALL&page=2')).toBe('newsType=EVENT&period=ALL&page=2');
    });

    it.each(['/stores', '/waiting'])('keeps the explicit all-region choice separate from a remembered region on %s', path => {
        const normalized = normalizeListQueryParams(path, new URLSearchParams('region=&view=list&keyword='));
        expect(normalized.get('region')).toBe('');
        expect(normalized.get('view')).toBe('list');
        expect(normalized.has('keyword')).toBe(false);
    });

    it('preserves search, district, nondefault sorting and distance coordinates', () => {
        const input = new URLSearchParams({ view: 'cards', keyword: '공방', region: '서울특별시 종로구', domain: 'OTHER',
            sort: 'distance', lat: '37.57', lng: '126.98', page: '2', utm_source: 'link' });
        expect(normalizeListQueryParams('/stores', input)).toEqual(input);
    });

    it('cleans duplicate, invalid and unknown options without mutating the caller', () => {
        const original = 'kind=posts&kind=news&view=list&unknown=yes&gclid=source';
        const input = new URLSearchParams(original);
        expect(normalizeListQueryParams('/my-favorites', input).toString()).toBe('kind=posts&view=list&gclid=source');
        expect(input.toString()).toBe(original);
        expect(Object.fromEntries(normalizeListQueryParams('/waiting', new URLSearchParams('status=INVALID&sort=distance&page=100001'))))
            .toEqual({ view: 'cards', status: 'ALL', sort: 'recommended', page: '1' });
        expect(Object.fromEntries(normalizeListQueryParams('/benefits', new URLSearchParams('newsType=INVALID&period=EXPIRED&page=0'))))
            .toEqual({ newsType: 'ALL', period: 'ONGOING', page: '1' });
    });

    it.each(['/stores', '/my-stores', '/my-favorites', '/waiting', '/my-reservations'])('keeps both peer view choices on %s', path => {
        for (const view of ['cards', 'list']) {
            expect(normalizeListQueryParams(path, new URLSearchParams({ view })).get('view')).toBe(view);
        }
    });

    it('uses only the active reservation tab defaults', () => {
        expect(Object.fromEntries(normalizeListQueryParams('/my-reservations', new URLSearchParams('tab=waiting'))))
            .toEqual({ tab: 'waiting', view: 'list', waitingStatus: 'ALL', waitingSort: 'recent', waitingPage: '1' });
    });

    it('leaves authentication, payment, message-target and workspace URLs to their own owners', () => {
        for (const path of ['/oauth2/callback', '/payment/result', '/messages', '/business', '/admin']) {
            const query = 'storeId=14&tab=ads&paymentId=local-proof&view=cards';
            expect(clean(path, query)).toBe(query);
        }
    });
});
