import { describe, expect, it } from 'vitest';
import { readQuerySelection, writeQuerySelection } from '../querySelection';

describe('browser-only all selections', () => {
    it.each(['', 'ALL', 'All', 'aLl', 'all'])('normalizes %j without changing the existing API selection', value => {
        expect(writeQuerySelection('status', value)).toBe('all');
        expect(readQuerySelection('status', value)).toBe('ALL');
        expect(writeQuerySelection('domain', value)).toBe('all');
        expect(readQuerySelection('domain', value)).toBe('');
    });

    it('does not interpret search text, required store placeholders, IDs or real enum values as all', () => {
        for (const key of ['search', 'reservationSearch', 'keyword', 'waitingStore', 'statisticsStore', 'chatIntroStore']) {
            expect(writeQuerySelection(key, 'ALL')).toBe('ALL');
            expect(readQuerySelection(key, '')).toBe('');
        }
        expect(writeQuerySelection('domain', 'FOOD')).toBe('FOOD');
        expect(readQuerySelection('status', 'OPEN')).toBe('OPEN');
        expect(writeQuerySelection('newsStore', '42')).toBe('42');
    });
});
