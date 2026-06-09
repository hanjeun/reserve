/**
 * RESERVE - 폼 유틸리티
 */

// null/undefined/빈 문자열이 아닐 때만 append
const appendOptional = (fd, key, val) => {
    if (val != null && val !== '') fd.append(key, val);
};

/**
 * 가게 등록/수정용 FormData 생성
 * @param {Object} values - 폼 값
 * @returns {FormData}
 */
export const buildStoreFormData = (values) => {
    const fd = new FormData();

    // 필수 필드
    fd.append('name',        values.name);
    fd.append('category',    values.category);
    fd.append('address',     values.address);
    fd.append('phone',       values.phone);
    fd.append('description', values.description || '');
    fd.append('noShowDeposit', values.noShowDeposit || 0);

    // 선택적 위치 정보
    appendOptional(fd, 'zipCode',       values.zipCode);
    appendOptional(fd, 'addressDetail', values.addressDetail);
    appendOptional(fd, 'latitude',      values.latitude);
    appendOptional(fd, 'longitude',     values.longitude);

    // 환불 정책 (기본값 포함)
    fd.append('fullRefundDays',    values.fullRefundDays    ?? 3);
    fd.append('partialRefundDays', values.partialRefundDays ?? 1);
    fd.append('partialRefundRate', values.partialRefundRate ?? 50);

    // 예약 슬롯 정책
    fd.append('maxCapacityPerSlot',
        (values.maxCapacityPerSlot != null && values.maxCapacityPerSlot !== '')
            ? String(values.maxCapacityPerSlot) : ''
    );
    fd.append('autoApprovalEnabled',      values.autoApprovalEnabled      ? 'true' : 'false');
    fd.append('allowLatePayment',          values.allowLatePayment          ? 'true' : 'false');
    fd.append('allowDuplicateReservation', values.allowDuplicateReservation ? 'true' : 'false');
    fd.append('emailNotificationEnabled',  values.emailNotificationEnabled  ? 'true' : 'false');

    // 예약 마감 시간 (없으면 미전송 → 백엔드 null = 제한 없음)
    appendOptional(fd, 'bookingDeadlineHours', values.bookingDeadlineHours);

    fd.append('paymentTimeoutMinutes',  values.paymentTimeoutMinutes  ?? 30);
    fd.append('reservationSlotMinutes', values.reservationSlotMinutes ?? 30);

    // 영업 시간
    if (values.times) {
        fd.append('openTime',  values.times[0].format('HH:mm'));
        fd.append('closeTime', values.times[1].format('HH:mm'));
    }

    // 브레이크 타임 (선택)
    if (values.breakTimes?.[0] && values.breakTimes?.[1]) {
        fd.append('breakStartTime', values.breakTimes[0].format('HH:mm'));
        fd.append('breakEndTime',   values.breakTimes[1].format('HH:mm'));
    }

    return fd;
};
