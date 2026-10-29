import { assertChatImageAccess, getChatImageBlob } from './chatImageTransfer';
import { cachedChatImage, chatImageCacheScope, forgetCachedChatImage, isChatImageScopeCurrent, rememberChatImage } from './chatImageCache';

const MAX_ACTIVE = 2;
const MAX_QUEUED = 32;
const queue = [];
const flights = new Map();
let active = 0;
const aborted = () => new DOMException('사진 요청을 중단했어요.', 'AbortError');
const current = job => !job.signal.aborted && (!job.reusable || isChatImageScopeCurrent(job.scope))
    && [...job.readers].some(reader => !reader.signal.aborted && reader.isCurrent());

function drain() {
    while (active < MAX_ACTIVE && queue.length) start(queue.shift());
}
function remove(job) { if (flights.get(job.key) === job) flights.delete(job.key); }
function finish(job, blob, error) {
    remove(job);
    for (const reader of job.readers) {
        reader.signal.removeEventListener('abort', reader.cancel);
        if (reader.signal.aborted || !reader.isCurrent() || job.scope.signal.aborted
            || job.reusable && !isChatImageScopeCurrent(job.scope)) reader.reject(aborted());
        else if (error) reader.reject(error);
        else reader.resolve(blob);
    }
    job.readers.clear();
}
function abandon(job) {
    if (job.readers.size) return;
    job.controller.abort();
    remove(job);
    const index = queue.indexOf(job);
    if (index !== -1) queue.splice(index, 1);
}
function start(job) {
    if (!current(job)) { finish(job, null, aborted()); return; }
    active += 1;
    Promise.resolve().then(async () => {
        if (!current(job)) throw aborted();
        const cached = job.reusable && cachedChatImage(job.key);
        if (cached) {
            // 재사용 전에도 서버에서 현재 참가 권한·회수·개인 삭제 상태를 확인한다.
            await assertChatImageAccess(job.url, job.signal);
            const latest = chatImageCacheScope(job.url);
            if (latest.generation !== job.scope.generation || latest.version !== job.scope.version) {
                job.scope = latest;
                if (!current(job)) throw aborted();
                return getChatImageBlob(job.url, job.signal);
            }
            return cached;
        }
        const blob = await getChatImageBlob(job.url, job.signal);
        if (job.reusable && current(job)) rememberChatImage(job.key, blob, job.scope);
        return blob;
    }).then(blob => finish(job, blob), error => {
        if (job.reusable) forgetCachedChatImage(job.key);
        finish(job, null, error);
    }).finally(() => { active -= 1; drain(); });
}

/** 동시 읽기는 두 개로 제한하고 참가자 사진만 같은 세션·방 안에서 합친다. */
export function requestChatImageBlob(url, signal, isCurrent, roomScope = '') {
    if (signal.aborted || !isCurrent()) return Promise.reject(aborted());
    const scope = chatImageCacheScope(url);
    const reusable = /^\/api\/(?:v1\/)?chat\/images\/[1-9]\d*$/.test(url);
    const key = reusable ? JSON.stringify([scope.epoch, scope.generation, scope.version, roomScope, url.replace('/api/v1/', '/api/')]) : Symbol();
    let job = flights.get(key);
    if (!job) {
        if (active >= MAX_ACTIVE && queue.length >= MAX_QUEUED) {
            const error = new Error('사진 요청이 많아요. 잠시 후 다시 시도해주세요.');
            error.status = 429;
            return Promise.reject(error);
        }
        const controller = new AbortController();
        job = { key, url, scope, reusable, controller,
            signal: AbortSignal.any([controller.signal, scope.signal]), readers: new Set() };
        flights.set(key, job);
    }
    const shared = job.readers.size > 0;
    const promise = new Promise((resolve, reject) => {
        const reader = { signal, isCurrent, resolve, reject };
        reader.cancel = () => {
            signal.removeEventListener('abort', reader.cancel);
            job.readers.delete(reader);
            reject(aborted());
            abandon(job);
        };
        job.readers.add(reader);
        signal.addEventListener('abort', reader.cancel, { once: true });
    });
    if (!shared) {
        if (active < MAX_ACTIVE) start(job);
        else queue.push(job);
    }
    return promise;
}
