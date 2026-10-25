import { describe, expect, it } from 'vitest';
import { isSearchResultPath, normalizeSearchResponse, parseSearchMessageTarget, positiveSearchId } from '../searchResults';

const store = { id: 12, type: 'STORE', title: '공개 가게', description: '안산', path: '/store/12' };
const group = (key = 'stores', items = [store]) => ({ key, items, error: null, hasMore: false });

describe('unified search navigation boundary', () => {
    it.each(['https://example.test/store/12', '//example.test/store/12', '/store/13', '/store/12?redirect=https://example.test', '/admin?tab=members', '/store/012', '/store/12#other'])('rejects unexpected or mismatched store destination %s', path => {
        expect(isSearchResultPath('stores', { ...store, path })).toBe(false);
    });
    it.each([['benefits', 'BENEFIT', '/benefits/12'], ['feed', 'FEED', '/feed/posts/12'],
        ['reservations', 'RESERVATION', '/my-reservations?reservationId=12'], ['waiting', 'WAITING', '/my-reservations?tab=waiting&entryId=12']])('accepts only the exact %s destination', (key, type, path) => {
        expect(isSearchResultPath(key, { ...store, type, path })).toBe(true);
        expect(isSearchResultPath(key, { ...store, id: 13, type, path })).toBe(false);
    });
    it('allows only the current messenger target variants and gates owner routes', () => {
        const message = path => ({ ...store, type: 'MESSAGE', path });
        expect(isSearchResultPath('messages', message('/messages?kind=support'))).toBe(true);
        expect(isSearchResultPath('messages', message('/messages?storeId=9'))).toBe(true);
        expect(isSearchResultPath('messages', message('/messages?ownerRoomId=9'), 'USER')).toBe(false);
        expect(isSearchResultPath('messages', message('/messages?ownerRoomId=9'), 'BUSINESS')).toBe(true);
        expect(isSearchResultPath('messages', message('/messages?storeId=9&ownerRoomId=8'), 'ADMIN')).toBe(false);
        expect(isSearchResultPath('messages', message('/messages?roomId=9'), 'ADMIN')).toBe(false);
    });
    it('preserves a valid group alongside malformed, missing or failed groups', () => {
        const result = normalizeSearchResponse({ keyword: '카페', groups: [group(), group('benefits', [{ ...store, type: 'BENEFIT', path: '/admin' }])] }, '카페', ['stores', 'benefits', 'feed']);
        expect(result.groups[0].items).toEqual([store]);
        expect(result.groups[1]).toMatchObject({ items: [], error: { status: 503 } });
        expect(result.groups[2]).toMatchObject({ items: [], error: { status: 503 } });
        const failed = normalizeSearchResponse({ keyword: '카페', groups: [{ ...group(), items: [], error: { status: 503, message: 'internal secret' } }] }, '카페', ['stores']);
        expect(failed.groups[0].error).toEqual({ status: 503 });
    });
    it('rejects mismatched keywords and response shapes instead of turning them into an empty search', () => {
        try {
            normalizeSearchResponse({ keyword: '다른 검색', groups: [] }, '카페', ['stores']);
            throw new Error('a mismatched response must fail');
        } catch (error) { expect(error.isInvalidSearchResponse).toBe(true); }
        expect(() => normalizeSearchResponse([], '카페', ['stores'])).toThrow();
        const result = normalizeSearchResponse({ keyword: '카페', groups: [group('stores', Array(6).fill(store))] }, '카페', ['stores']);
        expect(result.groups[0]).toMatchObject({ items: [], error: { status: 503 } });
    });
    it.each(['0', '-1', '01', '1.2', '1e2', '9007199254740992', '12/other'])('rejects noncanonical handoff ID %s', value => expect(positiveSearchId(value)).toBeNull());
    it('rejects ambiguous or unauthorized message URL targets', () => {
        expect(parseSearchMessageTarget(new URLSearchParams('storeId=7'), 'USER')).toEqual({ kind: 'store', storeId: 7 });
        expect(parseSearchMessageTarget(new URLSearchParams('kind=support'), 'USER')).toEqual({ kind: 'support' });
        expect(parseSearchMessageTarget(new URLSearchParams('ownerRoomId=7'), 'BUSINESS')).toEqual({ kind: 'owner', roomId: 7 });
        for (const query of ['ownerRoomId=7', 'storeId=7&kind=support', 'storeId=7&storeId=8', 'kind=admin']) {
            expect(parseSearchMessageTarget(new URLSearchParams(query), 'USER')).toBeNull();
        }
    });
});
