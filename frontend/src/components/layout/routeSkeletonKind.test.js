import { describe, expect, it } from 'vitest';
import { getRouteSkeletonKind, normalizeRouteSkeletonPath, resolveRouteSkeletonLocation } from './routeSkeletonKind';
import { clearRedirect, saveRedirect } from '../../utils/redirect';

describe('route skeleton path normalization', () => {
    it.each([
        ['', '/'], ['/', '/'], ['////', '/'],
        ['/login///', '/login'], ['/store/12/edit//', '/store/12/edit'],
        ['/store//12', '/store//12'], ['/unknown///suffix', '/unknown///suffix'],
    ])('normalizes only the trailing slashes of %s', (path, normalized) => {
        expect(normalizeRouteSkeletonPath(path)).toBe(normalized);
    });

    it('handles long paths and trailing slash runs without a backtracking expression', () => {
        const longSegment = 'x'.repeat(100_000);
        expect(normalizeRouteSkeletonPath('/' + longSegment + '/'.repeat(100_000))).toBe('/' + longSegment);
        expect(normalizeRouteSkeletonPath('/'.repeat(100_000))).toBe('/');
        expect(normalizeRouteSkeletonPath('/' + longSegment)).toBe('/' + longSegment);
    });

    it.each([
        ['/', 'discovery'], ['/search', 'search'], ['/my-page', 'my-page'],
        ['/store/register', 'store-form'], ['/store/12/edit', 'store-form'], ['/store/12', 'detail'],
        ['/stores', 'store-list'], ['/benefits', 'benefits'], ['/benefits/abc', 'benefit-detail'],
        ['/waiting', 'coming-soon'], ['/feed', 'coming-soon'],
        ['/my-stores', 'cards'], ['/my-favorites', 'cards'], ['/my-reservations', 'reservations'],
        ['/login', 'auth'], ['/signup', 'auth'], ['/forgot-password', 'auth'], ['/signup/social', 'auth'],
        ['/terms', 'legal'], ['/privacy', 'legal'], ['/operation-guide', 'legal'], ['/content-sources', 'legal'],
        ['/payment/result', 'payment-result'], ['/admin', 'admin'], ['/business', 'business'], ['/messages', 'messages'],
        ['/oauth2/callback', 'discovery'], ['/unknown', 'not-found'], ['/store/12/unknown', 'not-found'],
        ['/benefits/1/extra', 'not-found'],
    ])('preserves %s routing with and without trailing slashes', (path, kind) => {
        expect(getRouteSkeletonKind(path)).toBe(kind);
        expect(getRouteSkeletonKind(path + '///')).toBe(kind);
    });

    it('keeps the pending OAuth destination until authentication consumes it', () => {
        clearRedirect();
        expect(resolveRouteSkeletonLocation('/oauth2/callback')).toEqual({ pathname: '/', search: '' });
        saveRedirect('/my-reservations?view=list');
        try {
            expect(resolveRouteSkeletonLocation('/oauth2/callback')).toEqual({ pathname: '/my-reservations', search: '?view=list' });
            expect(resolveRouteSkeletonLocation('/oauth2/callback')).toEqual({ pathname: '/my-reservations', search: '?view=list' });
            expect(resolveRouteSkeletonLocation('/oauth2/callback', '?newUser=true')).toEqual({ pathname: '/signup/social', search: '' });
            expect(resolveRouteSkeletonLocation('/oauth2/callback', '?error=oauth2')).toEqual({ pathname: '/login', search: '' });
        } finally { clearRedirect(); }
    });
});
