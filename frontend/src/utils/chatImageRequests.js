import { getChatImageBlob } from './chatImageTransfer';

const MAX_ACTIVE = 2;
const MAX_QUEUED = 32;
const queue = [];
let active = 0;

const aborted = () => new DOMException('사진 요청을 중단했어요.', 'AbortError');

function drain() {
    while (active < MAX_ACTIVE && queue.length) start(queue.shift());
}

function start(job) {
    if (job.signal.aborted || !job.isCurrent()) {
        job.signal.removeEventListener('abort', job.cancel);
        job.reject(aborted());
        return;
    }
    job.started = true;
    active += 1;
    // 대기 중 계정·방·가시성이 바뀌면 네트워크 요청 자체를 시작하지 않는다.
    Promise.resolve().then(() => {
        if (job.signal.aborted || !job.isCurrent()) throw aborted();
        return getChatImageBlob(job.url, job.signal);
    }).then(blob => {
        if (job.signal.aborted || !job.isCurrent()) job.reject(aborted());
        else job.resolve(blob);
    }, job.reject).finally(() => {
        active -= 1;
        job.signal.removeEventListener('abort', job.cancel);
        drain();
    });
}

/** 탭 안의 읽기만 두 개씩 수행한다. 대기 취소는 즉시 제거하고 실제 읽기 종료까지 슬롯을 유지한다. */
export function requestChatImageBlob(url, signal, isCurrent) {
    if (signal.aborted || !isCurrent()) return Promise.reject(aborted());
    return new Promise((resolve, reject) => {
        const job = { url, signal, isCurrent, resolve, reject, started: false };
        job.cancel = () => {
            if (!job.started) {
                const index = queue.indexOf(job);
                if (index !== -1) queue.splice(index, 1);
                signal.removeEventListener('abort', job.cancel);
            }
            reject(aborted());
        };
        if (active >= MAX_ACTIVE && queue.length >= MAX_QUEUED) {
            const error = new Error('사진 요청이 많아요. 잠시 후 다시 시도해주세요.');
            error.status = 429;
            reject(error);
            return;
        }
        signal.addEventListener('abort', job.cancel, { once: true });
        if (active < MAX_ACTIVE) start(job);
        else queue.push(job);
    });
}
