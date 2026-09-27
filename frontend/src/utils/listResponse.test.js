import { describe, expect, it } from 'vitest';
import { listRows, normalizeListPage } from './listResponse';

describe('list response normalization', () => {
    it.each([null, undefined])('treats an empty successful body as an empty page', value => {
        expect(normalizeListPage(value, 2)).toEqual({
            content: [],
            page: { number: 2, totalPages: 0, totalElements: 0 },
            last: true,
        });
    });

    it('preserves arrays and Spring page payloads', () => {
        expect(listRows([{ id: 1 }])).toEqual([{ id: 1 }]);
        const page = { content: [{ id: 2 }], page: { totalElements: 1 } };
        expect(normalizeListPage(page)).toBe(page);
    });

    it('does not hide a malformed response as an empty result', () => {
        expect(() => normalizeListPage({ records: [] })).toThrow('목록 응답 형식');
    });
});
