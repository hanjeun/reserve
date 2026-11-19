import { assertCurrentSession } from './sessionScope';

let inFlight = null;
let writes = Promise.resolve();

/** 같은 출처에서 세션 쿠키를 쓰는 응답이 서로 앞지르지 않게 한다. */
export function writeSessionCookies(scope, send) {
    const write = () => { assertCurrentSession(scope); return send(); };
    const run = async () => {
        let acquired = false;
        const perform = () => { acquired = true; return write(); };
        try {
            const locks = globalThis.navigator?.locks;
            return await (locks?.request ? locks.request('reserve-session-cookie', perform) : perform());
        } catch (error) {
            if (!acquired && error?.name === 'SecurityError') return write();
            throw error;
        }
    };
    const pending = writes.then(run);
    writes = pending.catch(() => {});
    return pending;
}

/** 세션 확인과 API 재시도가 같은 기기의 재발급 요청을 공유해요. */
export function refreshSessionOnce(scope, send) {
    assertCurrentSession(scope);
    if (inFlight?.scope === scope) return inFlight.promise;
    const flight = { scope };
    flight.promise = writeSessionCookies(scope, send).then(value => {
        assertCurrentSession(scope);
        return value;
    }).finally(() => {
        if (inFlight === flight) inFlight = null;
    });
    inFlight = flight;
    return flight.promise;
}
