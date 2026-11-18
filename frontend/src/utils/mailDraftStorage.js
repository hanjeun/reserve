import { LOCAL_DRAFT_TTL_MS, runDraftTransaction } from './localDraftDatabase';

const OBJECT_STORE = 'mail-forms';
const mailPrefix = userId => `member:${userId}:mail:`;
const mailKey = (userId, id) => `${mailPrefix(userId)}${id}`;
const run = (mode, operation) => runDraftTransaction(OBJECT_STORE, mode, operation);

export async function saveMailDraft(userId, { id = crypto.randomUUID(), form, photos }) {
    if (userId == null) throw new Error('관리자 계정을 확인할 수 없어 임시저장하지 못했어요.');
    const savedAt = Date.now();
    const { toEmail, subject, body, marketing } = form;
    const record = { id, key: mailKey(userId, id), form: { toEmail, subject, body, marketing }, photos,
        savedAt, expiresAt: savedAt + LOCAL_DRAFT_TTL_MS };
    await run('readwrite', store => store.put(record));
}

export async function listMailDrafts(userId) {
    if (userId == null || typeof indexedDB === 'undefined') return [];
    const prefix = mailPrefix(userId);
    const now = Date.now();
    const rows = [];
    await run('readwrite', store => {
        const cursor = store.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
        cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            const { id, savedAt, expiresAt, form } = entry.value;
            if (expiresAt <= now) entry.delete();
            else rows.push({ id, savedAt, toEmail: form.toEmail, subject: form.subject, bodyPreview: form.body.slice(0, 120) });
            entry.continue();
        };
    });
    return rows.sort((left, right) => right.savedAt - left.savedAt);
}

export async function readMailDraft(userId, id) {
    if (userId == null || !id) return null;
    let draft = null;
    await run('readonly', store => {
        const request = store.get(mailKey(userId, id));
        request.onsuccess = () => {
            if (request.result?.expiresAt > Date.now()) draft = request.result;
        };
    });
    return draft;
}

export async function deleteMailDraft(userId, id) {
    if (userId == null || !id) return;
    await run('readwrite', store => store.delete(mailKey(userId, id)));
}
