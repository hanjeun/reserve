import React from 'react';
import PropTypes from 'prop-types';
import { FileTextOutlined } from '@ant-design/icons';
import { Card } from '../common';
import ReservationStatusBadge from './ReservationStatusBadge';
import { formatCurrency, formatTime, getThumbnailUrl } from '../../utils';

/**
 * 예약 카드형 보기의 공용 표현 컴포넌트.
 *
 * 목록형의 촘촘한 ReservationRow를 카드에 그대로 넣지 않고, 내 가게 카드와 같은
 * 이미지 → 본문 → 균등 액션 바 구조를 사용한다. 액션의 종류와 상태 변경은 각 화면이
 * 계속 소유하고 이 컴포넌트는 표시와 배치만 맡는다.
 */
export default function ReservationSummaryCard({
    reservation,
    onOpenDetail,
    actions = [],
    extraNote,
    showMemberInfo = false,
}) {
    const {
        storeName, storeMainImageUrl, depositAmount, depositPaid, status, specialRequest,
        reservationCode, reservationDate, reservationTime, memberName, guestCount,
        allowLatePayment, paymentTimeoutMinutes,
    } = reservation;
    const unpaid = depositAmount > 0 && !depositPaid && status === 'PENDING';
    const timeoutNote = unpaid && !allowLatePayment
        ? `${paymentTimeoutMinutes || 30}분 내 결제`
        : null;

    const cardActions = React.Children.toArray(actions).map((action) => {
        if (!React.isValidElement(action)) return action;
        return React.cloneElement(action, {
            className: [action.props.className, 'reserve-card-action', 'reserve-reservation-card-action']
                .filter(Boolean).join(' '),
        });
    });

    return (
        <Card
            hoverable
            className="reserve-reservation-summary-card"
            actions={cardActions.length > 0 ? cardActions : undefined}
        >
            <div className="reserve-tap-card reserve-reservation-summary-card-content">
                <Card.Cover src={getThumbnailUrl(storeMainImageUrl)} alt="" />
                <div className="reserve-reservation-summary-card-body">
                    <div className="reserve-reservation-summary-card-heading">
                        <button
                            type="button"
                            className="reserve-tap-card__trigger reserve-reservation-summary-card-trigger"
                            onClick={onOpenDetail}
                            aria-label={`${storeName} 예약 상세 보기`}
                        >
                            <strong>{storeName}</strong>
                            {specialRequest && (
                                <FileTextOutlined
                                    className="reserve-reservation-summary-card-request"
                                    title="요청사항 있음"
                                />
                            )}
                        </button>
                        <ReservationStatusBadge status={status} unpaid={unpaid} />
                    </div>

                    <div className="reserve-reservation-summary-card-details">
                        <span className="reserve-reservation-summary-card-code">
                            {reservationCode || '예약번호 없음'}
                        </span>
                        <div className="reserve-reservation-summary-card-meta reserve-reservation-summary-card-party">
                            {showMemberInfo && memberName && (
                                <>
                                    <span>{memberName}</span>
                                    <span aria-hidden="true">·</span>
                                </>
                            )}
                            <span>{guestCount}명</span>
                        </div>
                        <div className="reserve-reservation-summary-card-meta">
                            <span>{reservationDate}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatTime(reservationTime)}</span>
                        </div>
                        <strong className="reserve-reservation-summary-card-price">
                            {formatCurrency(depositAmount)}
                        </strong>
                        {timeoutNote && (
                            <span className="reserve-reservation-summary-card-timeout">{timeoutNote}</span>
                        )}
                    </div>
                    {extraNote && <div className="reserve-reservation-summary-card-note">{extraNote}</div>}
                </div>
            </div>
        </Card>
    );
}

ReservationSummaryCard.propTypes = {
    reservation: PropTypes.shape({
        storeName: PropTypes.string.isRequired,
        storeMainImageUrl: PropTypes.string,
        depositAmount: PropTypes.number,
        depositPaid: PropTypes.bool,
        status: PropTypes.string.isRequired,
        specialRequest: PropTypes.string,
        reservationCode: PropTypes.string,
        reservationDate: PropTypes.string,
        reservationTime: PropTypes.string,
        memberName: PropTypes.string,
        guestCount: PropTypes.number,
        allowLatePayment: PropTypes.bool,
        paymentTimeoutMinutes: PropTypes.number,
    }).isRequired,
    onOpenDetail: PropTypes.func.isRequired,
    actions: PropTypes.node,
    extraNote: PropTypes.node,
    showMemberInfo: PropTypes.bool,
};
