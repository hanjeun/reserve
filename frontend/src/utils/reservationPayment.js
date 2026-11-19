export const PAYMENT_EXPIRED_MESSAGE = '결제 기한이 지나 결제할 수 없어요. 내 예약에서 상태를 확인해주세요.';

/** 목록 표시와 결제 실행이 같은 서버 기한을 사용해요. */
export function reservationPaymentDeadline(reservation) {
    const raw = reservation?.paymentDeadline;
    const eligible = reservation?.depositAmount > 0 && !reservation.depositPaid
        && reservation.status === 'PENDING' && !reservation.allowLatePayment;
    const parsed = eligible && typeof raw === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(raw) ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
}

export function requirePaymentTime(reservation) {
    const deadline = reservationPaymentDeadline(reservation);
    if (deadline != null && Date.now() >= deadline) throw new Error(PAYMENT_EXPIRED_MESSAGE);
}
