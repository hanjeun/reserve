import dayjs from 'dayjs';

const DATABASE_NAME = 'reserve-local-drafts';
const DATABASE_VERSION = 1;
const OBJECT_STORE = 'store-forms';
const DRAFT_SCHEMA_VERSION = 1;
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DATE_LIST_FIELDS = {
    closedDates: 'YYYY-MM-DD',
    operatingPeriod: 'YYYY-MM-DD',
    sessionTimes: 'HH:mm',
    times: 'HH:mm',
    breakTimes: 'HH:mm',
};

let databasePromise;

const openDatabase = () => {
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('이 브라우저에서는 로컬 임시저장을 지원하지 않습니다.'));
    }
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(OBJECT_STORE)) {
                database.createObjectStore(OBJECT_STORE, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => {
                database.close();
                databasePromise = undefined;
            };
            resolve(database);
        };
        request.onerror = () => {
            databasePromise = undefined;
            reject(request.error ?? new Error('로컬 임시저장소를 열지 못했습니다.'));
        };
        request.onblocked = () => {
            databasePromise = undefined;
            reject(new Error('다른 탭에서 임시저장소를 사용 중입니다. 열려 있는 RESERVE 탭을 확인해주세요.'));
        };
    });

    return databasePromise;
};

const runTransaction = async (mode, operation) => {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(OBJECT_STORE, mode);
        const store = transaction.objectStore(OBJECT_STORE);
        let result;

        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error ?? new Error('로컬 임시저장 처리에 실패했습니다.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('로컬 임시저장이 중단되었습니다.'));

        result = operation(store, transaction);
    });
};

export const makeStoreDraftKey = ({ userId, mode, storeId }) => {
    if (userId == null) return null;
    const target = mode === 'edit' ? String(storeId ?? '') : 'new';
    if (mode === 'edit' && !target) return null;
    return `member:${String(userId)}:store:${mode}:${target}`;
};

export const serializeStoreFormValues = (values = {}) => {
    const serialized = { ...values };
    // Upload fileList는 별도 이미지 레코드로 저장한다. 폼 값에 중복 보관하면 Blob과 AntD 내부
    // 속성이 함께 복제돼 용량이 커지고, 브라우저별 structured-clone 차이도 생긴다.
    delete serialized.mainImage;
    delete serialized.detailImages;

    Object.entries(DATE_LIST_FIELDS).forEach(([fieldName, format]) => {
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
    Object.entries(DATE_LIST_FIELDS).forEach(([fieldName, format]) => {
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

const stableValue = value => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((result, key) => {
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
    if (!key) throw new Error('로그인 정보를 확인할 수 없어 임시저장하지 못했습니다.');
    const savedAt = Date.now();
    const record = {
        key,
        schemaVersion: DRAFT_SCHEMA_VERSION,
        savedAt,
        expiresAt: savedAt + DRAFT_TTL_MS,
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

export const deleteStoreDraft = async key => {
    if (!key || typeof indexedDB === 'undefined') return;
    await runTransaction('readwrite', store => store.delete(key));
};

export const STORE_DRAFT_TTL_DAYS = DRAFT_TTL_MS / (24 * 60 * 60 * 1000);
