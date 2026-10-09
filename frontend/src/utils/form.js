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

// 빈 값(null/undefined/빈 문자열)이면 '' — 서버에서 "제한 없음"으로 읽는다
const optionalString = (val) => ((val != null && val !== '') ? String(val) : '');

const boolString = (val) => (val ? 'true' : 'false');

// multipart 배열: 같은 키를 여러 번 append, 비었으면 빈 문자열 하나
const appendList = (fd, key, list) => {
    if (list.length === 0) fd.append(key, '');
    else list.forEach(v => fd.append(key, v));
};

// 문자열이면 그대로, dayjs 면 format — 둘 다 아니면 undefined
const formatValue = (d, pattern) => (typeof d === 'string' ? d : d?.format?.(pattern));

// 영업 시간 + 브레이크 타임(선택)
const appendHours = (fd, values) => {
    if (values.times) {
        fd.append('openTime',  values.times[0].format('HH:mm'));
        fd.append('closeTime', values.times[1].format('HH:mm'));
    }
    if (Object.hasOwn(values, 'breakTimes')) {
        fd.append('breakStartTime', formatValue(values.breakTimes?.[0], 'HH:mm') || '');
        fd.append('breakEndTime', formatValue(values.breakTimes?.[1], 'HH:mm') || '');
    }
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
    fd.append('serviceDomain', values.serviceDomain);
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
    if (Object.hasOwn(values, 'maxCapacityPerSlot')) fd.append('maxCapacityPerSlot', optionalString(values.maxCapacityPerSlot));
    fd.append('autoApprovalEnabled',      boolString(values.autoApprovalEnabled));
    fd.append('allowLatePayment',          boolString(values.allowLatePayment));
    fd.append('allowDuplicateReservation', boolString(values.allowDuplicateReservation));
    fd.append('emailNotificationEnabled',  boolString(values.emailNotificationEnabled));
    appendOptional(fd, 'waitingIntakeMode', values.waitingIntakeMode);
    if (values.reservationEnabled != null) fd.append('reservationEnabled', boolString(values.reservationEnabled));
    if (values.imageAutoplayEnabled != null) {
        fd.append('imageAutoplayEnabled', boolString(values.imageAutoplayEnabled));
    }

    // 누락 = 유지, 명시적인 0/빈 값 = 제한 없음.
    if (Object.hasOwn(values, 'bookingDeadlineHours')) fd.append('bookingDeadlineHours', optionalString(values.bookingDeadlineHours));

    // ── 휴무 (2026-08-11) ────────────────────────────────────────────────────
    // ⚠️ multipart 에서 배열은 **같은 키를 여러 번 append** 해야 스프링이 List 로 바인딩한다.
    //    JSON.stringify 로 보내면 List<Integer> 에 못 꽂히고 400 이 난다.
    //
    // 누락은 기존 값 유지, 빈 문자열은 명시적 해제다.
    if (Object.hasOwn(values, 'closedDays')) appendList(fd, 'closedDays', (values.closedDays ?? []).map(String));

    const closedDates = (values.closedDates ?? [])
        .map(d => formatValue(d, 'YYYY-MM-DD'))
        .filter(Boolean);
    if (Object.hasOwn(values, 'closedDates')) appendList(fd, 'closedDates', closedDates);

    // 예약 방식 (2026-08-24). 값이 없으면 서버가 SLOT 으로 흡수하지만,
    // 명시적으로 보내는 편이 "무엇을 의도했는지"가 드러난다.
    if (Object.hasOwn(values, 'bookingType')) fd.append('bookingType', values.bookingType || 'SLOT');

    // 회차 목록 — 명시적으로 비운 경우에만 빈 문자열을 보낸다.
    // ★ SESSION 이 아닐 때도 보낸다. 서버가 방식에 따라 버릴지 말지 정한다 —
    //   프론트가 미리 거르면 두 곳이 같은 규칙을 알고 있어야 해서 언젠가 어긋난다.
    const sessionTimes = (values.sessionTimes ?? [])
        .map(t => formatValue(t, 'HH:mm'))
        .filter(Boolean);
    if (Object.hasOwn(values, 'sessionTimes')) appendList(fd, 'sessionTimes', sessionTimes);

    // 운영 기간: 누락은 유지, 입력 필드를 비우면 두 경계를 명시적으로 해제한다.
    const period = values.operatingPeriod ?? [];
    const toIso = (d) => formatValue(d, 'YYYY-MM-DD') || '';
    if (Object.hasOwn(values, 'operatingPeriod')) {
        fd.append('openDate', toIso(period[0]));
        fd.append('closeDate', toIso(period[1]));
    }

    // 빈 값 = 제한 없음
    if (Object.hasOwn(values, 'maxAdvanceBookingDays')) fd.append('maxAdvanceBookingDays', optionalString(values.maxAdvanceBookingDays));

    fd.append('paymentTimeoutMinutes',  values.paymentTimeoutMinutes  ?? 30);
    fd.append('reservationSlotMinutes', values.reservationSlotMinutes ?? 30);
    fd.append('nearbyRadiusKm',         values.nearbyRadiusKm ?? 3);

    // 영업 시간 · 브레이크 타임
    appendHours(fd, values);

    return fd;
};
