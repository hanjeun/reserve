import { reservationKeys } from '../hooks/queryKeys';
import { httpStatusOf } from './listErrorMessage';

export const RESERVATION_CONFLICT = {
    DUPLICATE: 'RESERVATION_DUPLICATE',
    CAPACITY: 'RESERVATION_CAPACITY',
    NOTICE_CHANGED: 'RESERVATION_NOTICE_CHANGED',
};

export function reservationConflictCode(error) {
    if (httpStatusOf(error) !== 409) return null;
    const code = error?.data?.code ?? error?.response?.data?.data?.code;
    if (Object.values(RESERVATION_CONFLICT).includes(code)) return code;
    // 오류 코드가 없는 서버의 예약 안내 변경 응답도 같은 범위를 갱신한다.
    return error?.message?.includes('예약 안내가 변경') ? RESERVATION_CONFLICT.NOTICE_CHANGED : null;
}

export function findCachedDuplicateReservation(client, session, storeId, date) {
    const latest = new Map();
    const after = Date.now() - 30_000;
    for (const query of client.getQueryCache().findAll({ queryKey: reservationKeys.my() })) {
        const { state, queryKey } = query;
        if (queryKey[3] !== session || state.status !== 'success' || state.isInvalidated
            || state.fetchStatus !== 'idle' || state.dataUpdatedAt <= after) continue;
        for (const reservation of state.data?.content ?? []) {
            if (reservation.storeId !== storeId || !Number.isSafeInteger(reservation.id)) continue;
            const previous = latest.get(reservation.id);
            if (!previous || state.dataUpdatedAt >= previous.updatedAt) {
                latest.set(reservation.id, { reservation, updatedAt: state.dataUpdatedAt });
            }
        }
    }
    for (const { reservation, updatedAt } of latest.values()) {
        if (reservation.reservationDate === date && ['PENDING', 'CONFIRMED'].includes(reservation.status)) {
            return `${session}:${storeId}:${date}:${reservation.id}:${updatedAt}`;
        }
    }
    return null;
}
