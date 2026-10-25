import React from 'react';
import PropTypes from 'prop-types';
import { FileTextOutlined } from '../common/icons';
import { Card } from '../common';
import ReservationStatusBadge from './ReservationStatusBadge';
import { formatCurrency, formatTime, getThumbnailUrl } from '../../utils';

/*
 * 표시·배치만 공유하며 실행 종류·상태 변경은 호출 화면에서 관리한다.
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
    const timeout = paymentTimeoutMinutes ?? 30;
    const timeoutNote = unpaid && !allowLatePayment && timeout > 0
        ? `${timeout}분 내 결제`
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
            data-list-item-id={`reservation:${reservation.id}`}
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
