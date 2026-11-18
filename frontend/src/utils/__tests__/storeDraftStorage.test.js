import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import {
    readStoreDraft,
    saveStoreDraft,
    fingerprintStoreDraftBase,
    hydrateStoreFormValues,
    listStoreDrafts,
    makeStoreDraftKey,
    purgeExpiredStoreDrafts,
    serializeDraftImages,
    serializeStoreFormValues,
} from '../storeDraftStorage';
import { deleteMailDraft, listMailDrafts, readMailDraft, saveMailDraft } from '../mailDraftStorage';

const records = new Map();
const mailRecords = new Map();

beforeAll(() => {
    const stores = new Map([['store-forms', records]]);
    let installedVersion = 1;
    const database = {
        objectStoreNames: { contains: name => stores.has(name) },
        createObjectStore: name => stores.set(name, mailRecords),
        close: () => undefined,
        transaction: name => {
            const entriesByKey = stores.get(name);
            const transaction = {
                objectStore: () => ({
                    put: (record) => {
                        entriesByKey.set(record.key, record);
                        queueMicrotask(() => transaction.oncomplete?.());
                        return {};
                    },
                    get: (key) => {
                        const request = {};
                        queueMicrotask(() => {
                            request.result = entriesByKey.get(key);
                            request.onsuccess?.();
                            queueMicrotask(() => transaction.oncomplete?.());
                        });
                        return request;
                    },
                    delete: (key) => {
                        entriesByKey.delete(key);
                        queueMicrotask(() => transaction.oncomplete?.());
                        return {};
                    },
                    openCursor: (range) => {
                        const request = {};
                        const entries = [...entriesByKey.entries()].filter(([key]) => !range || (key >= range.lower && key <= range.upper));
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
                                delete: () => entriesByKey.delete(key),
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
            open: (name, version) => {
                expect(name).toBe('reserve-local-drafts');
                const request = { result: database };
                queueMicrotask(() => {
                    if (installedVersion < version) {
                        request.onupgradeneeded?.();
                        installedVersion = version;
                    }
                    request.onsuccess?.();
                });
                return request;
            },
        },
    });
    Object.defineProperty(globalThis, 'IDBKeyRange', {
        configurable: true,
        value: { bound: (lower, upper) => ({ lower, upper }) },
    });
});

afterEach(() => {
    records.clear();
    mailRecords.clear();
    vi.useRealTimers();
});

it('preserves the store forms and keeps local mail bodies and photos scoped by administrator', async () => {
    const key = 'member:7:store:create:new';
    const savedAt = Date.now();
    records.set(key, { key, schemaVersion: 1, savedAt, expiresAt: savedAt + 60_000, values: { name: '기존 가게 초안' } });
    const photos = [new Blob(['mail-photo'], { type: 'image/png' })];
    const form = { toEmail: 'guest@example.test', subject: '새 메일 초안', body: '작성 중인 내용', marketing: true };
    await saveMailDraft(7, { id: 'compose', form, photos });
    await saveMailDraft(8, { id: 'compose', form: { ...form, subject: '다른 관리자' }, photos: [] });
    expect(await readStoreDraft(key)).toMatchObject({ values: { name: '기존 가게 초안' } });
    expect(await readMailDraft(7, 'compose')).toMatchObject({ form, photos });
    expect(await listMailDrafts(7)).toEqual([{
        id: 'compose', toEmail: form.toEmail, subject: form.subject, bodyPreview: form.body, savedAt: expect.any(Number),
    }]);
    await deleteMailDraft(7, 'compose');
    expect(await readMailDraft(7, 'compose')).toBeNull();
    expect(await readMailDraft(8, 'compose')).toMatchObject({ form: { subject: '다른 관리자' } });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(savedAt + 31 * 86_400_000);
    expect(await listMailDrafts(8)).toEqual([]);
    expect(mailRecords.size).toBe(0);
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

    it('lists only the current member’s live draft metadata in most recent order', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-11T00:00:00Z'));
        const expiredKey = makeStoreDraftKey({ userId: 7, mode: 'edit', storeId: 2 });
        await saveStoreDraft({ key: expiredKey, values: { name: '만료 초안' } });

        vi.setSystemTime(new Date('2026-10-12T00:00:00Z'));
        const create = await saveStoreDraft({
            key: makeStoreDraftKey({ userId: 7, mode: 'create' }), values: { name: '등록 초안', address: '임시 주소' },
        });
        await saveStoreDraft({ key: makeStoreDraftKey({ userId: 70, mode: 'create' }), values: { name: '다른 회원 초안' } });
        vi.setSystemTime(new Date('2026-10-12T00:01:00Z'));
        const edit = await saveStoreDraft({
            key: makeStoreDraftKey({ userId: 7, mode: 'edit', storeId: 31 }), values: { name: '수정 초안' },
        });

        expect(await listStoreDrafts(7)).toEqual([
            { key: edit.key, storeId: '31', name: '수정 초안', savedAt: edit.savedAt },
            { key: create.key, storeId: null, name: '등록 초안', savedAt: create.savedAt },
        ]);
        expect(records.has(expiredKey)).toBe(true);
    });
});
