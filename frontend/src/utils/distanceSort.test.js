import { describe, expect, it } from 'vitest';
import { distanceSortParams, hasDistanceCoordinates } from './distanceSort';

describe('distance sort URL contract', () => {
    it('uses the same rounded query values for live and saved locations', () => {
        expect(distanceSortParams({ latitude: 37.321234, longitude: 126.812876 }))
            .toEqual({ sort: 'distance', lat: '37.321', lng: '126.813' });
        expect(distanceSortParams({ latitude: 37.580987, longitude: 126.979432 }))
            .toEqual({ sort: 'distance', lat: '37.581', lng: '126.979' });
    });

    it('keeps valid zero coordinates and rejects malformed values before a list request', () => {
        expect(hasDistanceCoordinates(0, 0)).toBe(true);
        expect(distanceSortParams({ latitude: 0, longitude: 0 }))
            .toEqual({ sort: 'distance', lat: '0', lng: '0' });
        expect(hasDistanceCoordinates('north', '127')).toBe(false);
        expect(hasDistanceCoordinates(91, 127)).toBe(false);
        expect(distanceSortParams({ latitude: 37, longitude: null })).toBeNull();
    });
});
