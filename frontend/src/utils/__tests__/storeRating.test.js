import { describe, expect, it } from 'vitest';
import { normalizeStoreRating } from '../storeRating';

describe('store rating summary normalization', () => {
    it.each([
        [4.86, 2576, 4.86, 2576],
        ['4.7', '1200', 4.7, 1200],
        [' 4.7 ', ' 1200 ', 4.7, 1200],
        [0, 1, 0, 1],
        [5, 1, 5, 1],
    ])('preserves valid scores and counts (%j, %j)', (rating, count, expectedRating, expectedCount) => {
        expect(normalizeStoreRating(rating, count)).toEqual({ rating: expectedRating, reviewCount: expectedCount });
    });

    it.each([0, '0', undefined, null, '', ' ', -1, 1.5, Infinity, NaN, 'invalid', true, [], {}, Number.MAX_SAFE_INTEGER + 1])(
        'uses zero for both values when the count is absent, zero or invalid: %j', count => {
            expect(normalizeStoreRating(4.8, count)).toEqual({ rating: 0, reviewCount: 0 });
        },
    );

    it.each([undefined, null, '', ' ', 'invalid', Infinity, NaN, -1, 6, true, [], {}])(
        'never exposes an invalid score or discards a known positive count: %j', rating => {
            expect(normalizeStoreRating(rating, 3)).toEqual({ rating: 0, reviewCount: 3 });
        },
    );
});
