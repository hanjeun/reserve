/** 계정 경계의 요청 세대. 토큰·개인정보는 보관하지 않는다. */
let epoch = 0;
let controller = new AbortController();

export const currentSession = () => ({ epoch, signal: controller.signal });
export const isCurrentSession = (value) => value === epoch;
export const advanceSession = () => {
    controller.abort();
    controller = new AbortController();
    epoch += 1;
    return epoch;
};
export class StaleSessionError extends Error {
    constructor() {
        super('계정이 변경되어 이전 요청을 취소했습니다.');
        this.name = 'StaleSessionError';
        this.isStaleSession = true;
    }
}
export const assertCurrentSession = (value) => {
    if (!isCurrentSession(value)) throw new StaleSessionError();
};
