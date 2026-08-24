/**
 * RESERVE - 폼 유틸리티
 */

/**
 * `<Form scrollToFirstError={SCROLL_TO_FIRST_ERROR}>` 로 쓴다.
 *
 * 긴 폼(가게 등록은 화면 3~4개 높이다)에서 제출 버튼은 맨 아래에 있는데, 검증에 걸린 칸은
 * 위쪽일 때가 많다. 그러면 화면상으로는 **아무 일도 안 일어난 것처럼 보인다** — 버튼을 눌렀는데
 * 그대로다. 실제로는 저 위에서 빨간 글씨가 떠 있을 뿐이다.
 *
 * ⚠️ `inline: 'nearest'` 를 반드시 유지할 것. 기본값은 가로 위치까지 맞추려 드는데,
 *    iOS WebKit 에서 그게 **viewport 전체를 수평으로 밀어버린다**(AdminPanel.jsx:77 에
 *    같은 원인으로 scrollIntoView 를 걷어낸 이력이 있다).
 *    `scrollMode: 'if-needed'` 는 이미 보이는 칸이면 아예 스크롤하지 않게 한다.
 */
export const SCROLL_TO_FIRST_ERROR = {
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest',
    scrollMode: 'if-needed',
};

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

    // 예약 방식 (2026-08-24). 값이 없으면 서버가 SLOT 으로 흡수하지만,
    // 명시적으로 보내는 편이 "무엇을 의도했는지"가 드러난다.
    fd.append('bookingType', values.bookingType || 'SLOT');

    // 회차 목록 — 휴무와 같은 이유로 빈 값이라도 키를 하나 보낸다(서버가 항상 덮어쓴다).
    // ★ SESSION 이 아닐 때도 보낸다. 서버가 방식에 따라 버릴지 말지 정한다 —
    //   프론트가 미리 거르면 두 곳이 같은 규칙을 알고 있어야 해서 언젠가 어긋난다.
    const sessionTimes = (values.sessionTimes ?? [])
        .map(t => (typeof t === 'string' ? t : t?.format?.('HH:mm')))
        .filter(Boolean);
    if (sessionTimes.length === 0) fd.append('sessionTimes', '');
    else sessionTimes.forEach(t => fd.append('sessionTimes', t));

    // 운영 기간 (2026-08-24). 휴무와 같은 이유로 **빈 값이라도 키를 보낸다** —
    // 서버가 항상 덮어쓰기라, 안 보내면 기간을 지우려는 조작이 조용히 무시된다.
    const period = values.operatingPeriod ?? [];
    const toIso = (d) => (typeof d === 'string' ? d : d?.format?.('YYYY-MM-DD')) || '';
    fd.append('openDate',  toIso(period[0]));
    fd.append('closeDate', toIso(period[1]));

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
