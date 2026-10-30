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

// 요약 해시와 임의 요청 ID만 저장하고 폼 내용·인증 정보는 제외한다.
export async function reservationRequestAttempt(scope, payload, submittedRequestId = null) {
    if (submittedRequestId !== null && !UUID.test(submittedRequestId)) throw new Error('예약 요청 번호를 확인해주세요.');
    const time = /^\d{2}:\d{2}:00$/.test(payload.reservationTime) ? payload.reservationTime.slice(0, 5) : payload.reservationTime;
    const fields = [payload.storeId, payload.reservationDate, time,
        payload.guestCount, payload.specialRequest ?? null, payload.skipPayment === true];
    const proof = payload.legalConsent;
    if (proof) fields.push([proof.version, proof.noticeHash, proof.privacyAccepted === true, proof.conditionsAccepted === true]);
    const canonical = JSON.stringify(fields);
    const canPersist = !!crypto.subtle;
    const digest = canPersist ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)) : null;
    // WebCrypto가 없는 로컬 HTTP에서는 폼 내용을 저장하지 않고 메모리로 재시도한다.
    const hash = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : canonical;
    let saved = pending.get(scope);
    if (!saved && canPersist) {
        try { saved = JSON.parse(sessionStorage.getItem(keyFor(scope)) || 'null'); } catch { /* 메모리 재시도는 유지한다. */ }
    }
    const reused = saved?.hash === hash && UUID.test(saved?.requestId ?? '')
        && (submittedRequestId === null || saved.requestId === submittedRequestId);
    if (!reused) saved = { hash, requestId: submittedRequestId ?? newReservationRequestId() };
    pending.set(scope, saved);
    if (canPersist) {
        try { sessionStorage.setItem(keyFor(scope), JSON.stringify(saved)); } catch { /* 저장소 값은 인증 근거로 사용하지 않는다. */ }
    }
    return { requestId: saved.requestId, reused };
}

export async function reservationRequestId(scope, payload) {
    return (await reservationRequestAttempt(scope, payload)).requestId;
}

export function completeReservationRequest(scope, expectedRequestId = null) {
    const saved = pending.get(scope);
    if (!expectedRequestId || saved?.requestId === expectedRequestId) pending.delete(scope);
    try {
        const persisted = JSON.parse(sessionStorage.getItem(keyFor(scope)) || 'null');
        if (!expectedRequestId || persisted?.requestId === expectedRequestId) sessionStorage.removeItem(keyFor(scope));
    } catch { /* 저장소 정리 실패를 예약 실패로 처리하지 않는다. */ }
}
