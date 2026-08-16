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

    // ── 휴무 (2026-08-11) ────────────────────────────────────────────────────
    // ⚠️ multipart 에서 배열은 **같은 키를 여러 번 append** 해야 스프링이 List 로 바인딩한다.
    //    JSON.stringify 로 보내면 List<Integer> 에 못 꽂히고 400 이 난다.
    //
    // ⚠️ 값이 없어도 키를 하나는 보내야 한다. 아무것도 안 보내면 스프링이 필드를 null 로 두는데,
    //    서비스는 "항상 덮어쓰기"라 null → 빈 목록이 되어 결과적으로는 같다. 다만 그건 우연히
    //    맞는 것이라, 빈 문자열을 명시적으로 보내 "비우겠다"는 의도를 드러낸다.
    //    (백엔드 normalizeClosedDays/Dates 가 빈 값·형식 오류를 걸러낸다.)
    const closedDays = values.closedDays ?? [];
    if (closedDays.length === 0) fd.append('closedDays', '');
    else closedDays.forEach(d => fd.append('closedDays', String(d)));

    const closedDates = (values.closedDates ?? [])
        .map(d => (typeof d === 'string' ? d : d?.format?.('YYYY-MM-DD')))
        .filter(Boolean);
    if (closedDates.length === 0) fd.append('closedDates', '');
    else closedDates.forEach(d => fd.append('closedDates', d));

    // 빈 값 = 제한 없음
    fd.append('maxAdvanceBookingDays',
        (values.maxAdvanceBookingDays != null && values.maxAdvanceBookingDays !== '')
            ? String(values.maxAdvanceBookingDays) : ''
    );

    fd.append('paymentTimeoutMinutes',  values.paymentTimeoutMinutes  ?? 30);
    fd.append('reservationSlotMinutes', values.reservationSlotMinutes ?? 30);
    fd.append('nearbyRadiusKm',         values.nearbyRadiusKm ?? 3);

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
