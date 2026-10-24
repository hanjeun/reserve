const PREFIX = 'reserve:reservation-request:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pending = new Map();

const keyFor = scope => `${PREFIX}${encodeURIComponent(scope)}`;

export function newReservationRequestId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Persist only a digest and a random request ID. Form content and credentials stay out of storage.
export async function reservationRequestAttempt(scope, payload, submittedRequestId = null) {
    if (submittedRequestId !== null && !UUID.test(submittedRequestId)) throw new Error('예약 요청 번호를 확인해주세요.');
    const time = /^\d{2}:\d{2}:00$/.test(payload.reservationTime) ? payload.reservationTime.slice(0, 5) : payload.reservationTime;
    const canonical = JSON.stringify([payload.storeId, payload.reservationDate, time,
        payload.guestCount, payload.specialRequest ?? null, payload.skipPayment === true]);
    const canPersist = !!crypto.subtle;
    const digest = canPersist ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)) : null;
    // LAN HTTP previews may lack WebCrypto. Retain retries in memory without persisting form content.
    const hash = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : canonical;
    let saved = pending.get(scope);
    if (!saved && canPersist) {
        try { saved = JSON.parse(sessionStorage.getItem(keyFor(scope)) || 'null'); } catch { /* Memory retry remains available. */ }
    }
    const reused = saved?.hash === hash && UUID.test(saved?.requestId ?? '')
        && (submittedRequestId === null || saved.requestId === submittedRequestId);
    if (!reused) saved = { hash, requestId: submittedRequestId ?? newReservationRequestId() };
    pending.set(scope, saved);
    if (canPersist) {
        try { sessionStorage.setItem(keyFor(scope), JSON.stringify(saved)); } catch { /* Storage is optional, never authentication. */ }
    }
    return { requestId: saved.requestId, reused };
}

export async function reservationRequestId(scope, payload) {
    return (await reservationRequestAttempt(scope, payload)).requestId;
}

export function completeReservationRequest(scope) {
    pending.delete(scope);
    try { sessionStorage.removeItem(keyFor(scope)); } catch { /* No persisted value to clear. */ }
}
