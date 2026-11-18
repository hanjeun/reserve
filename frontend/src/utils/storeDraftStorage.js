import dayjs from 'dayjs';
import { deleteDraftRecord, LOCAL_DRAFT_TTL_MS, runDraftTransaction } from './localDraftDatabase';
import { isLegacyStoreId } from './storePublicAddress';

const OBJECT_STORE = 'store-forms';
const DRAFT_SCHEMA_VERSION = 1;

const DATE_LIST_FIELDS = {
    closedDates: 'YYYY-MM-DD',
    operatingPeriod: 'YYYY-MM-DD',
    sessionTimes: 'HH:mm',
    times: 'HH:mm',
    breakTimes: 'HH:mm',
    bookingOpeningPeriod: 'YYYY-MM-DD',
};
const DATE_FIELDS = { bookingOpeningDate: 'YYYY-MM-DD', bookingOpeningTime: 'YYYY-MM-DDTHH:mm' };

const runTransaction = (mode, operation) => runDraftTransaction(OBJECT_STORE, mode, operation);

const storeDraftPrefix = userId => `member:${String(userId)}:store:`;

export const makeStoreDraftKey = ({ userId, mode, storeId }) => {
    if (userId == null) return null;
    const target = mode === 'edit' ? String(storeId ?? '') : 'new';
    if (mode === 'edit' && !target) return null;
    return `${storeDraftPrefix(userId)}${mode}:${target}`;
};

export const serializeStoreFormValues = (values = {}) => {
    const serialized = { ...values };
    // Upload fileList는 별도 이미지 레코드로 저장한다. 폼 값에 중복 보관하면 Blob과 AntD 내부
    // 속성이 함께 복제돼 용량이 커지고, 브라우저별 structured-clone 차이도 생긴다.
    delete serialized.mainImage;
    delete serialized.detailImages;
    for (const [name, format] of Object.entries(DATE_FIELDS)) {
        if (values[name]?.format) serialized[name] = values[name].format(format);
    }

    Object.entries(DATE_LIST_FIELDS).forEach(([fieldName, format]) => {
        if (!Object.hasOwn(values, fieldName)) return;
        const fieldValue = values[fieldName];
        if (fieldValue == null) {
            serialized[fieldName] = fieldValue;
            return;
        }
        const list = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
        serialized[fieldName] = list.map(item => {
            if (item == null) return null;
            if (typeof item === 'string') return item;
            return item?.format?.(format) ?? null;
        });
    });

    return serialized;
};

export const hydrateStoreFormValues = (values = {}) => {
    const hydrated = { ...values };
    for (const name of Object.keys(DATE_FIELDS)) {
        if (values[name]) hydrated[name] = dayjs(values[name]);
    }
    Object.entries(DATE_LIST_FIELDS).forEach(([fieldName, format]) => {
        if (!Object.hasOwn(values, fieldName)) return;
        const fieldValue = values[fieldName];
        if (fieldValue == null) {
            hydrated[fieldName] = fieldValue;
            return;
        }
        hydrated[fieldName] = (Array.isArray(fieldValue) ? fieldValue : [fieldValue])
            .map(item => {
                if (!item) return null;
                // customParseFormat 플러그인을 쓰지 않으므로 "09:00"을 dayjs에 그대로 주면 Invalid Date다.
                // 날짜 부분은 제출 때 버려지고 HH:mm만 쓰므로 고정 기준일에 붙여 안전하게 복원한다.
                return format === 'HH:mm' ? dayjs(`2000-01-01T${item}:00`) : dayjs(item);
            });
    });
    return hydrated;
};

export const serializeDraftImages = (files = []) => files.map(file => {
    if (file?.existingUrl) {
        return {
            kind: 'existing',
            uid: file.uid,
            name: file.name,
            existingUrl: file.existingUrl,
            url: file.url ?? file.existingUrl,
        };
    }

    const source = file?.originFileObj;
    if (!source) return null;
    return {
        kind: 'local',
        uid: file.uid,
        name: file.name ?? source.name,
        type: file.type ?? source.type,
        lastModified: source.lastModified,
        file: source,
    };
}).filter(Boolean);

export const hydrateDraftImages = (records = []) => {
    const objectUrls = [];
    const files = records.map(record => {
        if (record.kind === 'existing') {
            return {
                uid: record.uid,
                name: record.name,
                status: 'done',
                url: record.url ?? record.existingUrl,
                existingUrl: record.existingUrl,
            };
        }

        if (record.kind !== 'local' || !record.file) return null;
        const previewUrl = URL.createObjectURL(record.file);
        objectUrls.push(previewUrl);
        return {
            uid: record.uid,
            name: record.name ?? record.file.name,
            type: record.type ?? record.file.type,
            status: 'done',
            originFileObj: record.file,
            url: previewUrl,
            thumbUrl: previewUrl,
            draftObjectUrl: previewUrl,
        };
    }).filter(Boolean);

    return { files, objectUrls };
};

// UTF-16 코드 단위 기준 비교 — 기본 sort()와 같은 순서.
const compareCodeUnits = (a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
};

const stableValue = value => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        // 기존 UTF-16 정렬을 유지해야 저장된 초안의 fingerprint가 달라지지 않는다.
        return Object.keys(value).sort(compareCodeUnits).reduce((result, key) => {
            result[key] = stableValue(value[key]);
            return result;
        }, {});
    }
    return value;
};

export const fingerprintStoreDraftBase = ({ values, mainImage = [], detailImages = [] }) => JSON.stringify(stableValue({
    values: serializeStoreFormValues(values),
    mainImage: serializeDraftImages(mainImage).map(item => item.existingUrl ?? item.name),
    detailImages: serializeDraftImages(detailImages).map(item => item.existingUrl ?? item.name),
}));

export const saveStoreDraft = async ({ key, values, mainImage, detailImages, baseFingerprint }) => {
    if (!key) throw new Error('로그인 정보를 확인할 수 없어 임시저장하지 못했어요.');
    const savedAt = Date.now();
    const record = {
        key,
        schemaVersion: DRAFT_SCHEMA_VERSION,
        savedAt,
        expiresAt: savedAt + LOCAL_DRAFT_TTL_MS,
        baseFingerprint: baseFingerprint ?? null,
        values: serializeStoreFormValues(values),
        mainImage: serializeDraftImages(mainImage),
        detailImages: serializeDraftImages(detailImages),
    };
    await runTransaction('readwrite', store => store.put(record));
    return record;
};

export const purgeExpiredStoreDrafts = async (now = Date.now()) => {
    if (typeof indexedDB === 'undefined') return 0;
    let removed = 0;
    await runTransaction('readwrite', store => {
        const request = store.openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            const record = cursor.value;
            if (record?.schemaVersion !== DRAFT_SCHEMA_VERSION || record?.expiresAt <= now) {
                cursor.delete();
                removed += 1;
            }
            cursor.continue();
        };
    });
    return removed;
};

export const readStoreDraft = async key => {
    if (!key) return null;
    const record = await runTransaction('readonly', store => {
        const request = store.get(key);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => reject(request.error);
        });
    });
    const resolved = await record;
    if (!resolved) return null;
    if (resolved.schemaVersion !== DRAFT_SCHEMA_VERSION || resolved.expiresAt <= Date.now()) {
        await deleteStoreDraft(key);
        return null;
    }
    return resolved;
};

export const listStoreDrafts = async userId => {
    if (userId == null) return [];
    const prefix = storeDraftPrefix(userId);
    const now = Date.now();
    const drafts = [];
    await runTransaction('readonly', store => {
        const request = store.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            const record = cursor.value;
            const target = record.key.slice(prefix.length);
            const storeId = target.startsWith('edit:') ? target.slice('edit:'.length) : null;
            if ((target === 'create:new' || isLegacyStoreId(storeId)) && record.schemaVersion === DRAFT_SCHEMA_VERSION
                && record.expiresAt > now && Number.isFinite(record.savedAt)) {
                const name = typeof record.values?.name === 'string' ? record.values.name.trim() : '';
                drafts.push({ key: record.key, storeId, name, savedAt: record.savedAt });
            }
            cursor.continue();
        };
    });
    return drafts.sort((left, right) => right.savedAt - left.savedAt);
};

export const deleteStoreDraft = async key => {
    if (!key || typeof indexedDB === 'undefined') return;
    return deleteDraftRecord(OBJECT_STORE, key);
};

export const deleteSavedStoreDraft = (userId, key, expectedSavedAt) => userId != null && key.startsWith(storeDraftPrefix(userId))
    ? deleteDraftRecord(OBJECT_STORE, key, expectedSavedAt) : false;

export const STORE_DRAFT_TTL_DAYS = LOCAL_DRAFT_TTL_MS / (24 * 60 * 60 * 1000);
