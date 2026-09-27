import { describe, expect, it } from 'vitest';
import { resolveRouteEntryMotion } from './routeEntryMotion';

const base = {
    previousPathname: '/stores',
    pathname: '/store/1',
    previousDiscoveryTabIndex: -1,
    currentDiscoveryTabIndex: -1,
    previousHistoryIndex: null,
    historyIndex: null,
    navigationType: 'PUSH',
    explicitDirection: undefined,
};

describe('resolveRouteEntryMotion', () => {
    it('skips the first render and query-only updates', () => {
        expect(resolveRouteEntryMotion({ ...base, previousPathname: null })).toBeNull();
        expect(resolveRouteEntryMotion({ ...base, pathname: '/stores' })).toBeNull();
    });

    it('uses tab order for discovery navigation', () => {
        expect(resolveRouteEntryMotion({
            ...base,
            previousPathname: '/', pathname: '/benefits',
            previousDiscoveryTabIndex: 0, currentDiscoveryTabIndex: 2,
        })).toBe('from-right');
        expect(resolveRouteEntryMotion({
            ...base,
            previousPathname: '/benefits', pathname: '/stores',
            previousDiscoveryTabIndex: 2, currentDiscoveryTabIndex: 1,
        })).toBe('from-left');
    });

    it('uses the actual history direction for back and forward navigation', () => {
        expect(resolveRouteEntryMotion({ ...base, previousHistoryIndex: 4, historyIndex: 3, navigationType: 'POP' }))
            .toBe('from-left');
        expect(resolveRouteEntryMotion({ ...base, previousHistoryIndex: 3, historyIndex: 4, navigationType: 'POP' }))
            .toBe('from-right');
    });

    it('accepts an explicit semantic back direction for replacement routes', () => {
        expect(resolveRouteEntryMotion({
            ...base, previousHistoryIndex: 3, historyIndex: 4, explicitDirection: 'from-left',
        })).toBe('from-left');
        expect(resolveRouteEntryMotion({ ...base, navigationType: 'POP', explicitDirection: 'from-right' }))
            .toBe('from-left');
        expect(resolveRouteEntryMotion({ ...base, navigationType: 'REPLACE', explicitDirection: 'from-left' }))
            .toBe('from-left');
    });

    it('does not slide when the search screen closes by submit, quick search or cancel', () => {
        expect(resolveRouteEntryMotion({ ...base, previousPathname: '/search', pathname: '/stores' })).toBeNull();
        expect(resolveRouteEntryMotion({
            ...base, previousPathname: '/search/', pathname: '/', navigationType: 'POP', previousHistoryIndex: 3, historyIndex: 2,
        })).toBeNull();
        expect(resolveRouteEntryMotion({ ...base, previousPathname: '/stores', pathname: '/search-results' })).toBe('from-right');
    });

    it('does not slide automatic replacements such as login redirects', () => {
        expect(resolveRouteEntryMotion({ ...base, previousPathname: '/my-page', pathname: '/login', navigationType: 'REPLACE' })).toBeNull();
        expect(resolveRouteEntryMotion({ ...base, previousPathname: '/login', pathname: '/my-page', navigationType: 'REPLACE' })).toBeNull();
    });

    it('leaves the mobile messages screen to its own open and close motion', () => {
        const base = { previousDiscoveryTabIndex: -1, currentDiscoveryTabIndex: -1, previousHistoryIndex: 3, historyIndex: 4 };
        expect(resolveRouteEntryMotion({ ...base, previousPathname: '/', pathname: '/messages', navigationType: 'PUSH' })).toBeNull();
        expect(resolveRouteEntryMotion({ ...base, previousPathname: '/messages', pathname: '/', navigationType: 'POP', historyIndex: 2 })).toBeNull();
        expect(resolveRouteEntryMotion({ ...base, previousPathname: '/', pathname: '/messages/12', navigationType: 'PUSH' })).toBeNull();
        expect(resolveRouteEntryMotion({ ...base, previousPathname: '/', pathname: '/messagesx', navigationType: 'PUSH' })).toBe('from-right');
    });
});
