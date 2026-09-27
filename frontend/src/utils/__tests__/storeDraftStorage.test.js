import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import {
    readStoreDraft,
    saveStoreDraft,
    fingerprintStoreDraftBase,
    hydrateStoreFormValues,
    makeStoreDraftKey,
    purgeExpiredStoreDrafts,
    serializeDraftImages,
    serializeStoreFormValues,
} from '../storeDraftStorage';

const records = new Map();

beforeAll(() => {
    const database = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => undefined,
        close: () => undefined,
        transaction: () => {
            const transaction = {
                objectStore: () => ({
                    put: (record) => {
                        records.set(record.key, record);
                        queueMicrotask(() => transaction.oncomplete?.());
                        return {};
                    },
                    get: (key) => {
                        const request = {};
                        queueMicrotask(() => {
                            request.result = records.get(key);
                            request.onsuccess?.();
                            queueMicrotask(() => transaction.oncomplete?.());
                        });
                        return request;
                    },
                    delete: (key) => {
                        records.delete(key);
                        queueMicrotask(() => transaction.oncomplete?.());
                        return {};
                    },
                    openCursor: () => {
                        const request = {};
                        const entries = [...records.entries()];
                        let index = 0;
                        const advance = () => {
                            if (index >= entries.length) {
                                request.result = null;
                                request.onsuccess?.();
                                queueMicrotask(() => transaction.oncomplete?.());
                                return;
                            }
                            const [key, value] = entries[index];
                            request.result = {
                                value,
                                delete: () => records.delete(key),
                                continue: () => {
                                    index += 1;
                                    queueMicrotask(advance);
                                },
                            };
                            request.onsuccess?.();
                        };
                        queueMicrotask(advance);
                        return request;
                    },
                }),
            };
            return transaction;
        },
    };
    Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: {
            open: () => {
                const request = { result: database };
                queueMicrotask(() => request.onsuccess?.());
                return request;
            },
        },
    });
});

afterEach(() => {
    records.clear();
    vi.useRealTimers();
});

describe('storeDraftStorage', () => {
    it('serializes form dates and excludes duplicate Upload state', () => {
        const serialized = serializeStoreFormValues({
            name: '예약 가게',
            closedDates: [dayjs('2026-09-11')],
            operatingPeriod: [null, dayjs('2026-12-31')],
            times: [dayjs('2026-09-11T09:00:00'), dayjs('2026-09-11T22:00:00')],
            mainImage: [{ uid: 'upload-state' }],
            detailImages: [{ uid: 'upload-state-2' }],
        });

        expect(serialized).toEqual({
            name: '예약 가게',
            closedDates: ['2026-09-11'],
            operatingPeriod: [null, '2026-12-31'],
            times: ['09:00', '22:00'],
        });
    });

    it('hydrates time-only values into valid dayjs objects without a parsing plugin', () => {
        const hydrated = hydrateStoreFormValues({
            times: ['09:00', '22:00'],
            closedDates: ['2026-09-11'],
        });

        expect(hydrated.times.every(value => value.isValid())).toBe(true);
        expect(hydrated.times.map(value => value.format('HH:mm'))).toEqual(['09:00', '22:00']);
        expect(hydrated.closedDates[0].format('YYYY-MM-DD')).toBe('2026-09-11');
    });

    it('keeps drafts isolated by member and edit target', () => {
        expect(makeStoreDraftKey({ userId: 7, mode: 'create' })).toBe('member:7:store:create:new');
        expect(makeStoreDraftKey({ userId: 7, mode: 'edit', storeId: 31 })).toBe('member:7:store:edit:31');
        expect(makeStoreDraftKey({ userId: null, mode: 'create' })).toBeNull();
    });

    it('builds a stable base fingerprint regardless of object key insertion order', () => {
        const left = fingerprintStoreDraftBase({ values: { name: 'A', category: 'B' } });
        const right = fingerprintStoreDraftBase({ values: { category: 'B', name: 'A' } });
        expect(left).toBe(right);
    });

    it('stores existing image references and new browser files without AntD internals', () => {
        const localFile = new File(['image'], 'store.png', { type: 'image/png', lastModified: 123 });
        const serialized = serializeDraftImages([
            { uid: '-1', name: 'existing', existingUrl: 'stores/1/main.webp', url: 'https://cdn/example.webp' },
            { uid: '2', name: 'store.png', originFileObj: localFile, thumbUrl: 'blob:temporary' },
        ]);

        expect(serialized[0]).toMatchObject({ kind: 'existing', existingUrl: 'stores/1/main.webp' });
        expect(serialized[1]).toMatchObject({ kind: 'local', name: 'store.png', file: localFile });
        expect(serialized[1]).not.toHaveProperty('thumbUrl');
    });

    it('persists a draft and deletes it after the 30-day TTL', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-11T00:00:00Z'));
        const key = makeStoreDraftKey({ userId: 7, mode: 'create' });

        await saveStoreDraft({ key, values: { name: '임시 가게' }, mainImage: [], detailImages: [] });
        expect((await readStoreDraft(key)).values.name).toBe('임시 가게');

        vi.setSystemTime(new Date('2026-10-12T00:00:00Z'));
        expect(await readStoreDraft(key)).toBeNull();
        expect(records.has(key)).toBe(false);
    });

    it('purges expired drafts for stores the user no longer revisits', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-11T00:00:00Z'));
        const oldKey = makeStoreDraftKey({ userId: 7, mode: 'edit', storeId: 1 });
        await saveStoreDraft({ key: oldKey, values: { name: 'old' }, mainImage: [], detailImages: [] });

        vi.setSystemTime(new Date('2026-10-12T00:00:00Z'));
        const currentKey = makeStoreDraftKey({ userId: 7, mode: 'edit', storeId: 2 });
        await saveStoreDraft({ key: currentKey, values: { name: 'current' }, mainImage: [], detailImages: [] });

        expect(await purgeExpiredStoreDrafts()).toBe(1);
        expect(records.has(oldKey)).toBe(false);
        expect(records.has(currentKey)).toBe(true);
    });
});
