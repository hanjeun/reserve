/**
 * RESERVE - 가게 카테고리 상수
 */

export const STORE_CATEGORIES = [
    { value: '한식', label: '한식' },
    { value: '일식', label: '일식' },
    { value: '양식', label: '양식' },
    { value: '중식', label: '중식' },
    { value: '카페', label: '카페' },
    { value: '치킨', label: '치킨' },
    { value: '버거', label: '버거' },
    { value: '피자', label: '피자' },
    { value: '아시안', label: '아시안' },
    { value: '분식', label: '분식' },
    { value: '샘러드', label: '샘러드' },
    { value: '디저트', label: '디저트' },
    { value: '바/술집', label: '바/술집' },
    { value: '기타', label: '기타' },
];

// STORE_CATEGORIES에서 파생 — 별도 상수 불필요
export const CATEGORY_VALUES = STORE_CATEGORIES.map(c => c.value);

// 전액 환불 기준일 옵션 (제한 없음 계열 → 맨 아래)
export const FULL_REFUND_DAYS_OPTIONS = [
    { value: 1,  label: '1일 전' },
    { value: 2,  label: '2일 전' },
    { value: 3,  label: '3일 전' },
    { value: 5,  label: '5일 전' },
    { value: 7,  label: '7일 전' },
    { value: 14, label: '14일 전' },
    { value: 0,  label: '환불 없음' },
];

// 부분 환불 기준일 옵션 (적용 안 함 → 맨 아래)
export const PARTIAL_REFUND_DAYS_OPTIONS = [
    { value: 1, label: '1일 전' },
    { value: 2, label: '2일 전' },
    { value: 3, label: '3일 전' },
    { value: 5, label: '5일 전' },
    { value: 0, label: '적용 안 함' },
];

// 부분 환불율 옵션 (0% → 맨 아래)
export const PARTIAL_REFUND_RATE_OPTIONS = [
    { value: 0,   label: '0%' },
    { value: 30,  label: '30%' },
    { value: 50,  label: '50%' },
    { value: 70,  label: '70%' },
    { value: 100, label: '100% (전액)' },
];

// 예약 마감 시간 옵션 (제한 없음 → 맨 아래)
export const BOOKING_DEADLINE_OPTIONS = [
    { value: 1,  label: '1시간 전' },
    { value: 2,  label: '2시간 전' },
    { value: 3,  label: '3시간 전' },
    { value: 6,  label: '6시간 전' },
    { value: 12, label: '12시간 전' },
    { value: 24, label: '24시간 전' },
    { value: 48, label: '48시간 전' },
    { value: 0,  label: '제한 없음' },
];

// 결제 마감 시간 옵션 (제한 없음 → 맨 아래)
//
// ★ 2026-08-09 — "제한 없음"의 값을 1440 → 0 으로 바꿨다.
//   1440분은 제한 없음이 아니라 **24시간 뒤 자동 취소**였다(ReservationExpiryScheduler).
//   가게 상세 페이지는 같은 값을 "24시간"으로 정직하게 표시하고 있어서
//   등록 폼과 상세 화면이 서로 다른 말을 하고 있었다.
//   이젠 0 이 sentinel 이고 스케줄러가 그 가게를 건너뛴다.
//   24시간이 필요한 사람을 위해 1440 은 제 이름으로 남겨둔다.
export const PAYMENT_TIMEOUT_OPTIONS = [
    { value: 10,   label: '10분' },
    { value: 15,   label: '15분' },
    { value: 30,   label: '30분' },
    { value: 60,   label: '1시간' },
    { value: 120,  label: '2시간' },
    { value: 1440, label: '24시간' },
    { value: 0,    label: '제한 없음' },
];

// 예약 단위 시간 옵션
export const RESERVATION_SLOT_OPTIONS = [
    { value: 30,  label: '30분' },
    { value: 60,  label: '1시간' },
    { value: 90,  label: '1시간 30분' },
    { value: 120, label: '2시간' },
    { value: 240, label: '4시간' },
];

// "우리동네" 배지 표시 기준 거리 옵션 (백엔드 StoreService와 동일하게 1~10km로 제한, 0 = 배지 끄기)
export const NEARBY_RADIUS_OPTIONS = [
    { value: 1,  label: '1km' },
    { value: 2,  label: '2km' },
    { value: 3,  label: '3km' },
    { value: 5,  label: '5km' },
    { value: 7,  label: '7km' },
    { value: 10, label: '10km' },
    { value: 0,  label: '없음 (배지 표시 안 함)' },
];

/**
 * 예약 방식 (2026-08-24 신설).
 *
 * ★ 체크박스를 늘리지 않고 **하나를 고르면 나머지가 따라오게** 한다.
 *   옵션을 여러 개 주면 사장님이 조합을 만들지 못한다.
 *
 * 값은 백엔드 Store.BookingType 과 정확히 같아야 한다.
 */
export const BOOKING_TYPE_OPTIONS = [
    { value: 'SLOT',    label: '시간대 (기본)' },
    { value: 'SESSION', label: '회차제' },
    { value: 'DAY',     label: '날짜만' },
];

/** 화면에 왜 이걸 고르는지 한 줄로 설명한다 — 이름만으로는 고를 수 없다. */
export const BOOKING_TYPE_HINTS = {
    SLOT:    '영업시간을 예약 단위로 쪼개요. 식당·미용실·병원',
    SESSION: '회차를 직접 정해요. 공연·클래스·투어',
    DAY:     '시간 선택 없이 날짜만 받아요. 팝업스토어·종일권·대관',
};
