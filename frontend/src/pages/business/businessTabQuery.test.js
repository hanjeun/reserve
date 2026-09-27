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
});
