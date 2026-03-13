/**
 * RESERVE - 폼 유틸리티
 */

/**
 * 가게 등록/수정용 FormData 생성
 * @param {Object} values - 폼 값
 * @returns {FormData}
 */
export const buildStoreFormData = (values) => {
    const formData = new FormData();

    formData.append('name',          values.name);
    formData.append('category',      values.category);
    formData.append('address',       values.address);
    formData.append('phone',         values.phone);
    formData.append('description',   values.description || '');
    formData.append('noShowDeposit', values.noShowDeposit || 0);

    // 환불 정책
    formData.append('fullRefundDays',    values.fullRefundDays    != null ? values.fullRefundDays    : 3);
    formData.append('partialRefundDays', values.partialRefundDays != null ? values.partialRefundDays : 1);
    formData.append('partialRefundRate', values.partialRefundRate != null ? values.partialRefundRate : 50);

    // 예약 슬롯 정책
    formData.append('maxCapacityPerSlot',
        (values.maxCapacityPerSlot != null && values.maxCapacityPerSlot !== '') ? String(values.maxCapacityPerSlot) : ''
    );
    formData.append('autoApprovalEnabled',       values.autoApprovalEnabled       ? 'true' : 'false');
    formData.append('allowLatePayment',           values.allowLatePayment           ? 'true' : 'false');
    formData.append('allowDuplicateReservation',  values.allowDuplicateReservation  ? 'true' : 'false');
    formData.append('emailNotificationEnabled',   values.emailNotificationEnabled   ? 'true' : 'false');

    // 예약 마감 시간 (비워두면 전송 안 함 → 백엔드 null = 제한 없음)
    if (values.bookingDeadlineHours != null && values.bookingDeadlineHours !== '') {
        formData.append('bookingDeadlineHours', values.bookingDeadlineHours);
    }

    // 결제 대기 만료 시간 (기본 30분)
    formData.append('paymentTimeoutMinutes', values.paymentTimeoutMinutes != null ? values.paymentTimeoutMinutes : 30);

    // 예약 단위 시간 (기본 30분)
    formData.append('reservationSlotMinutes', values.reservationSlotMinutes != null ? values.reservationSlotMinutes : 30);

    if (values.times) {
        formData.append('openTime',  values.times[0].format('HH:mm'));
        formData.append('closeTime', values.times[1].format('HH:mm'));
    }

    return formData;
};
