import { Children, isValidElement } from 'react';

const PAYMENT_DEADLINE_ACTIONS = new Set(['pay', 'edit', 'approve']);

/** 만료 뒤에도 취소·거절·삭제는 서버의 상태·금전 확인을 거쳐 실행해요. */
export function filterReservationActions(actions, expired) {
    return Children.map(actions, action => expired && isValidElement(action)
        && PAYMENT_DEADLINE_ACTIONS.has(action.key) ? null : action);
}

export function reservationActionNotice(reservation, expired, hasActions) {
    if (expired) return '자동 취소 확인 중';
    if (!hasActions && reservation.status === 'UNCONFIRMED') return '가게의 이용 확인 대기';
    return null;
}
