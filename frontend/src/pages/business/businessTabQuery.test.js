import { describe, expect, it } from 'vitest';
import { businessTabSearch } from './businessTabQuery';

describe('businessTabSearch', () => {
    it('removes reservation and statistics state when the advertisement tab opens', () => {
        const result = new URLSearchParams(businessTabSearch(
            '?view=list&tab=ads&statisticsRange=90d&advertisementSearch=카페',
            'ads',
        ));

        expect(result.get('tab')).toBe('ads');
        expect(result.get('advertisementSearch')).toBe('카페');
        expect(result.has('view')).toBe(false);
        expect(result.has('statisticsRange')).toBe(false);
    });

    it('keeps unrelated attribution values while changing business tabs', () => {
        const result = new URLSearchParams(businessTabSearch(
            '?tab=analytics&statisticsRange=90d&utm_source=portfolio',
            'reservations',
        ));

        expect(result.get('tab')).toBe('reservations');
        expect(result.get('utm_source')).toBe('portfolio');
        expect(result.has('statisticsRange')).toBe(false);
    });

    it('keeps waiting selection and view only in tabs that use them', () => {
        const waiting = new URLSearchParams(businessTabSearch('?waitingStore=5&waitingSearch=손님&view=cards&reservationPage=2', 'waiting'));
        expect(waiting.get('tab')).toBe('waiting');
        expect(waiting.get('waitingStore')).toBe('5');
        expect(waiting.get('waitingSearch')).toBe('손님');
        expect(waiting.get('view')).toBe('cards');
        expect(waiting.has('reservationPage')).toBe(false);
        const analytics = new URLSearchParams(businessTabSearch(waiting, 'analytics'));
        expect(analytics.has('waitingStore')).toBe(false);
        expect(analytics.has('waitingSearch')).toBe(false);
        expect(analytics.has('view')).toBe(false);
    });
});
