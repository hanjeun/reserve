import { assertCurrentSession } from './sessionScope';

let inFlight = null;

/** 세션 확인과 API 재시도가 같은 기기의 재발급 요청을 공유해요. */
export function refreshSessionOnce(scope, send) {
    assertCurrentSession(scope);
    if (inFlight?.scope === scope) return inFlight.promise;
    const flight = { scope };
    flight.promise = Promise.resolve().then(() => {
        assertCurrentSession(scope);
        return send();
    }).then(value => {
        assertCurrentSession(scope);
        return value;
    }).finally(() => {
        if (inFlight === flight) inFlight = null;
    });
    inFlight = flight;
    return flight.promise;
}
