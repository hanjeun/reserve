const DATABASE_NAME = 'reserve-local-drafts';
const DATABASE_VERSION = 2;
const OBJECT_STORES = ['store-forms', 'mail-forms'];
export const LOCAL_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let databasePromise;

function openDatabase() {
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('이 브라우저에서는 로컬 임시저장을 지원하지 않아요.'));
    }
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        let blocked = false;
        request.onupgradeneeded = () => {
            const database = request.result;
            for (const name of OBJECT_STORES) {
                if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => {
            const database = request.result;
            if (blocked) { database.close(); return; }
            database.onversionchange = () => {
                database.close();
                databasePromise = undefined;
            };
            resolve(database);
        };
        request.onerror = () => {
            if (!blocked) databasePromise = undefined;
            reject(request.error ?? new Error('로컬 임시저장소를 열지 못했어요.'));
        };
        request.onblocked = () => {
            blocked = true;
            databasePromise = undefined;
            reject(new Error('다른 탭에서 임시저장소를 사용 중이에요. 열려 있는 RESERVE 탭을 확인해주세요.'));
        };
    });
    return databasePromise;
}

export async function runDraftTransaction(name, mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(name, mode);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error ?? new Error('로컬 임시저장 처리에 실패했어요.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('로컬 임시저장이 중단됐어요.'));
        result = operation(transaction.objectStore(name));
    });
}

export async function deleteDraftRecord(name, key, expectedSavedAt) {
    let matches = true;
    await runDraftTransaction(name, 'readwrite', store => {
        if (expectedSavedAt === undefined) {
            store.delete(key);
            return;
        }
        const request = store.get(key);
        request.onsuccess = () => {
            if (!request.result) return;
            matches = request.result.savedAt === expectedSavedAt;
            if (matches) store.delete(key);
        };
    });
    return matches;
}
