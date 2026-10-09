export const STORE_ONBOARDING_DEFAULTS = Object.freeze({
    reservationEnabled: true, bookingType: 'SLOT', reservationSlotMinutes: 30,
    waitingIntakeMode: 'OFF', noShowDeposit: 0, autoApprovalEnabled: false,
    allowLatePayment: false, allowDuplicateReservation: false, emailNotificationEnabled: true,
    imageAutoplayEnabled: true, nearbyRadiusKm: 3, fullRefundDays: 3,
    partialRefundDays: 1, partialRefundRate: 50, paymentTimeoutMinutes: 30,
    closedDays: [], closedDates: [],
});

export const intakeService = values => values.reservationEnabled === false ? 'waiting'
    : values.waitingIntakeMode && values.waitingIntakeMode !== 'OFF' ? 'both' : 'reservation';

export const STORE_EDIT_SECTIONS = Object.freeze([
    { value: 'industry', label: '업종', description: '서비스 분야와 업종을 바꿔요.' },
    { value: 'service', label: '접수 방식', description: '예약과 웨이팅 접수를 켜거나 꺼요.' },
    { value: 'booking', label: '예약 방식', description: '시간대·회차·날짜와 예약 단위를 바꿔요.' },
    { value: 'waiting', label: '웨이팅', description: '현장 QR과 원격 접수 방식을 바꿔요.' },
    { value: 'operation', label: '운영 설정', description: '영업시간·휴무·인원·예약금·환불 정책을 바꿔요.' },
    { value: 'identity', label: '소개·사진', description: '가게 이름·주소·연락처·소개와 사진을 바꿔요.' },
]);

export const STORE_EDIT_SELECTION_HELP = '바꿀 항목을 선택해주세요. 수정한 내용은 미리보기에서 확인하고 수정 완료로 저장해요.';

export const onboardingSteps = (values, mode = 'create') => [
    ...(mode === 'edit' ? [{ key: 'selection', title: '무엇을 수정하시겠어요?', fields: [] }] : []),
    { key: 'industry', title: '어떤 가게를 운영하시나요?', fields: ['serviceDomain', 'category'] },
    { key: 'service', title: '손님을 어떻게 받고 싶으세요?', fields: [] },
    ...(mode === 'edit' || values.reservationEnabled !== false ? [{ key: 'booking', title: '손님이 무엇을 선택하면 되나요?', fields: ['bookingType', 'sessionTimes', 'reservationSlotMinutes'] }] : []),
    ...(mode === 'edit' || values.waitingIntakeMode && values.waitingIntakeMode !== 'OFF' ? [{ key: 'waiting', title: '웨이팅은 어디에서 접수할까요?', fields: ['waitingIntakeMode'] }] : []),
    { key: 'operation', title: '언제, 몇 명까지 받을까요?', fields: ['times', 'breakTimes', 'maxCapacityPerSlot', 'noShowDeposit', 'fullRefundDays', 'partialRefundDays', 'partialRefundRate', 'paymentTimeoutMinutes', 'maxAdvanceBookingDays', 'bookingDeadlineHours', 'nearbyRadiusKm'] },
    { key: 'identity', title: '손님에게 가게를 소개해주세요.', fields: ['name', 'address', 'phone', 'mainImage', 'description'] },
    { key: 'review', title: '손님에게 이렇게 보여요.', fields: [] },
];

const clockTime = value => typeof value === 'string' ? value : value?.format?.('HH:mm');
const date = value => typeof value === 'string' ? value : value?.format?.('YYYY-MM-DD');
export const onboardingPreviewStore = (values, imageUrls, originalStore = {}) => ({
    ...originalStore, ...STORE_ONBOARDING_DEFAULTS, ...values,
    name: values.name || '가게 이름', rating: originalStore.rating ?? 0, reviewCount: originalStore.reviewCount ?? 0,
    mainImageUrl: imageUrls[0], detailImageUrls: imageUrls.slice(1),
    openTime: clockTime(values.times?.[0]), closeTime: clockTime(values.times?.[1]),
    breakStartTime: clockTime(values.breakTimes?.[0]), breakEndTime: clockTime(values.breakTimes?.[1]),
    sessionTimes: (values.sessionTimes || []).map(clockTime),
    openDate: date(values.operatingPeriod?.[0]), closeDate: date(values.operatingPeriod?.[1]),
    closedDates: (values.closedDates || []).map(date),
    noShowDeposit: values.reservationEnabled === false ? 0 : values.noShowDeposit || 0,
    maxCapacityPerSlot: values.maxCapacityPerSlot ?? null,
});
