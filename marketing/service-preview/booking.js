import { MAX_RESERVATION_GUESTS, MAX_RESERVATION_REQUEST_LENGTH } from '../../frontend/src/utils/validation';
import { RESERVATION_CONFLICT } from '../../frontend/src/utils/reservationConflicts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const KST_OFFSET = 9 * HOUR;

export const previewBookingDate = (now, offset = 0) => new Date(now + KST_OFFSET + offset * DAY).toISOString().slice(0, 10);

const parseDate = date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null;
    const parsed = new Date(date + 'T00:00:00Z');
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : parsed;
};
const timeMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const formatMinutes = minutes => [Math.floor(minutes / 60), minutes % 60].map(value => String(value).padStart(2, '0')).join(':');

export const isPreviewBookingActive = entry => entry.status === 'PENDING' || entry.status === 'CONFIRMED';
export const previewSlotTime = time => /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time ?? '') ? time.slice(0, 5) : null;

// 예시 가게는 SLOT 방식이다. 달력·시간 조회와 예약 쓰기에 같은 시간표를 사용한다.
export function previewSlotGrid(store) {
    const start = timeMinutes(store.openTime);
    const end = timeMinutes(store.closeTime);
    const breakStart = timeMinutes(store.breakStartTime);
    const breakEnd = timeMinutes(store.breakEndTime);
    const slots = [];
    for (let at = start; at + store.reservationSlotMinutes <= end; at += store.reservationSlotMinutes) {
        if (at < breakStart || at >= breakEnd) slots.push(formatMinutes(at));
    }
    return slots;
}

export function describePreviewBookingDay(store, date, entries, now, excludeId) {
    const blocked = status => ({ date, status, totalSlots: 0, openSlots: 0, holiday: false, slots: [] });
    const parsed = parseDate(date);
    if (!parsed) return blocked('INVALID');
    if (date < previewBookingDate(now)) return blocked('PAST');
    if (store.closedDays.includes(parsed.getUTCDay() || 7) || store.closedDates?.includes(date)) return blocked('CLOSED');
    if (!store.reservationEnabled || (store.openDate && date < store.openDate) || (store.closeDate && date > store.closeDate)) {
        return blocked('OUT_OF_PERIOD');
    }
    if (store.maxAdvanceBookingDays > 0 && date > previewBookingDate(now, store.maxAdvanceBookingDays)) return blocked('TOO_FAR');

    const scheduled = previewSlotGrid(store);
    const slots = scheduled.flatMap(time => {
        const startsAt = Date.parse(date + 'T' + time + ':00+09:00');
        if (startsAt <= now || startsAt - store.bookingDeadlineHours * HOUR < now) return [];
        const booked = entries.filter(entry => entry.id !== excludeId && entry.storeId === store.id
            && entry.reservationDate === date && previewSlotTime(entry.reservationTime) === time && isPreviewBookingActive(entry))
            .reduce((total, entry) => total + entry.guestCount, 0);
        const remainingCapacity = store.maxCapacityPerSlot > 0 ? Math.max(0, store.maxCapacityPerSlot - booked) : null;
        return [{ time, available: remainingCapacity !== 0, remainingCapacity }];
    });
    const openSlots = slots.filter(slot => slot.available).length;
    return { date, status: openSlots > 0 ? 'OPEN' : 'FULL', totalSlots: scheduled.length, openSlots, holiday: false, slots };
}

export function previewCalendar(month, describeDay) {
    const first = parseDate(month + '-01');
    if (!first) return null;
    const after = new Date(first);
    after.setUTCMonth(first.getUTCMonth() + 1);
    const days = (after - first) / DAY;
    return Array.from({ length: days }, (_, index) => {
        const { date, status, totalSlots, openSlots, holiday } = describeDay(month + '-' + String(index + 1).padStart(2, '0'));
        return { date, status, totalSlots, openSlots, holiday };
    });
}

export function previewBookingProblem(store, day, reservation, memberReservations, excludeId) {
    const { reservationDate, reservationTime, guestCount, specialRequest } = reservation;
    const bad = message => ({ status: 400, message });
    const conflict = (code, message) => ({ status: 409, message, code });
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > MAX_RESERVATION_GUESTS) {
        return bad('예약 인원을 확인해주세요.');
    }
    if (specialRequest != null && (typeof specialRequest !== 'string' || specialRequest.length > MAX_RESERVATION_REQUEST_LENGTH)) {
        return bad('요청 사항은 ' + MAX_RESERVATION_REQUEST_LENGTH + '자까지 입력할 수 있어요.');
    }
    if (day.status === 'CLOSED') return bad('휴무일에는 예약할 수 없어요. 다른 날짜를 선택해주세요.');
    if (day.status !== 'OPEN' && day.status !== 'FULL') return bad('예약 가능한 날짜를 선택해주세요.');
    const slot = day.slots.find(item => item.time === previewSlotTime(reservationTime));
    if (!slot) return bad('예약 가능한 시간대를 선택해주세요.');
    if (!store.allowDuplicateReservation && memberReservations.some(entry => entry.id !== excludeId && entry.storeId === store.id
        && entry.reservationDate === reservationDate && isPreviewBookingActive(entry))) {
        return conflict(RESERVATION_CONFLICT.DUPLICATE, '이미 해당 날짜에 예약이 있어요. 같은 날 중복 예약할 수 없어요.');
    }
    if (!slot.available) return conflict(RESERVATION_CONFLICT.CAPACITY, '해당 시간대 예약이 마감됐어요. 다른 시간대를 선택해주세요.');
    if (slot.remainingCapacity != null && guestCount > slot.remainingCapacity) {
        return conflict(RESERVATION_CONFLICT.CAPACITY, '이 시간은 ' + slot.remainingCapacity + '명까지 예약할 수 있어요.');
    }
    return null;
}
