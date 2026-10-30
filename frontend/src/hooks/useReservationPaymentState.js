import { useCallback, useState, useSyncExternalStore } from 'react';

let timer;
const listeners = new Set();
function createClock() {
    let value = Date.now();
    return { snapshot: () => value, update: now => { value = now; } };
}
function refresh() {
    if (document.visibilityState === 'hidden') return;
    const observedAt = Date.now();
    for (const item of listeners) item.notify(observedAt);
    const running = [...listeners].some(item => item.deadline > observedAt);
    if (running && timer == null) timer = setInterval(refresh, 1000);
    if (!running && timer != null) { clearInterval(timer); timer = undefined; }
}
function watch(deadline, notify) {
    if (deadline == null) return () => {};
    const item = { deadline, notify };
    listeners.add(item);
    if (listeners.size === 1) document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => {
        listeners.delete(item);
        if (!listeners.size) {
            clearInterval(timer); timer = undefined;
            document.removeEventListener('visibilitychange', refresh);
        }
    };
}

/** 표시와 실행 도구가 같은 서버 기한과 하나의 화면 시계를 사용한다. */
export default function useReservationPaymentState(reservation) {
    const raw = reservation.paymentDeadline;
    const eligible = reservation.depositAmount > 0 && !reservation.depositPaid
        && reservation.status === 'PENDING' && !reservation.allowLatePayment;
    const parsed = eligible && typeof raw === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(raw) ? Date.parse(raw) : NaN;
    const deadline = Number.isFinite(parsed) ? parsed : null;
    const [clock] = useState(createClock);
    const subscribe = useCallback(notify => watch(deadline, value => { clock.update(value); notify(); }), [deadline, clock]);
    const now = useSyncExternalStore(subscribe, clock.snapshot, clock.snapshot);
    const seconds = deadline == null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
    return { deadline, seconds, expired: seconds === 0 };
}
