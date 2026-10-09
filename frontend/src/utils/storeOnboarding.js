import { VALIDATION_RULES } from './validation';

export const STORE_ONBOARDING_DEFAULTS = Object.freeze({
    reservationEnabled: true, bookingType: 'SLOT', reservationSlotMinutes: 30,
    waitingIntakeMode: 'OFF', noShowDeposit: 0, autoApprovalEnabled: false,
    allowLatePayment: false, allowDuplicateReservation: false, emailNotificationEnabled: true,
    imageAutoplayEnabled: true, nearbyRadiusKm: 3, fullRefundDays: 3,
    partialRefundDays: 1, partialRefundRate: 50, paymentTimeoutMinutes: 30,
    closedDays: [], closedDates: [], bookingDeadlineHours: 0,
});

export const intakeService = values => values.reservationEnabled === false ? 'waiting'
    : values.waitingIntakeMode && values.waitingIntakeMode !== 'OFF' ? 'both' : 'reservation';

export const reservationApplies = values => values.reservationEnabled !== false;
export const depositSelected = values => typeof values._depositEnabled === 'boolean'
    ? values._depositEnabled : Number(values.noShowDeposit) > 0;
export const depositApplies = values => reservationApplies(values) && depositSelected(values);
const always = () => true;
const slotApplies = values => reservationApplies(values) && values.bookingType === 'SLOT';
const sessionApplies = values => reservationApplies(values) && values.bookingType === 'SESSION';
const latePaymentApplies = values => depositApplies(values) && values.allowLatePayment === true;
const refundWindowApplies = values => depositApplies(values) && Number(values.fullRefundDays) > 0;
const partialRefundApplies = values => refundWindowApplies(values) && Number(values.partialRefundDays) > 0;
const required = message => [{ required: true, message }];
const positiveDeposit = [...required('예약금을 입력해주세요.'),
    { type: 'number', min: 1, max: 100000, message: '1~100,000원 사이로 입력해주세요.' }];
const partialRefundRules = [...required('부분 환불 기준을 선택해주세요.'), ({ getFieldValue }) => ({
    validator: (_rule, days) => {
        const full = Number(getFieldValue('fullRefundDays'));
        return full > 0 && Number(days) > 0 && Number(days) >= full
            ? Promise.reject(new Error('부분 환불 기준은 전액 환불 기준보다 가까운 날로 선택해주세요.'))
            : Promise.resolve();
    },
})];

// 필드 소유권·진입 조건·검증 조건·미리보기 수정 목적지를 함께 관리한다.
const field = (name, rules = [], applies = always) => ({ name, rules, applies });
export const STORE_ONBOARDING_DOMAINS = Object.freeze([
    { key: 'industry', label: '업종', title: '어떤 가게를 운영하시나요?', asset: 'edit-industry',
        description: '서비스 분야와 업종을 바꿔요.', applies: always,
        fields: [field('serviceDomain', required('서비스 분야를 선택해주세요.')), field('category', VALIDATION_RULES.category)] },
    { key: 'service', label: '접수 방식', title: '손님을 어떻게 받고 싶으세요?', asset: 'intake-both',
        description: '예약과 웨이팅 접수를 켜거나 꺼요.', applies: always, fields: [field('reservationEnabled')] },
    { key: 'booking', label: '예약 방식', title: '손님이 무엇을 선택하면 되나요?', asset: 'intake-reservation',
        description: '시간대·회차·날짜와 예약 단위를 바꿔요.', applies: reservationApplies,
        fields: [field('bookingType'), field('reservationSlotMinutes', required('시간 선택 간격을 선택해주세요.'), slotApplies),
            field('sessionTimes', required('회차를 하나 이상 등록해주세요.'), sessionApplies)] },
    { key: 'waiting', label: '웨이팅', title: '웨이팅은 어디에서 접수할까요?', asset: 'waiting-both',
        description: '현장 QR과 원격 접수 방식을 바꿔요.', applies: values => Boolean(values.waitingIntakeMode && values.waitingIntakeMode !== 'OFF'),
        fields: [field('waitingIntakeMode')] },
    { key: 'operation', label: '영업 일정', title: '언제 가게를 운영하시나요?', asset: 'edit-operation',
        description: '영업시간·휴무·운영 기간과 우리동네 배지를 바꿔요.', applies: always,
        fields: [field('times', VALIDATION_RULES.businessHours), field('breakTimes', VALIDATION_RULES.breakTimes, slotApplies),
            field('closedDays'), field('closedDates'), field('operatingPeriod'), field('nearbyRadiusKm', required('반경을 선택해주세요.'))] },
    { key: 'booking-policy', label: '예약 접수 규칙', title: '예약을 어떤 규칙으로 받을까요?', asset: 'edit-booking-policy',
        description: '예약 인원·승인·중복·예약 가능 기간과 마감을 바꿔요.', applies: reservationApplies,
        fields: [field('maxCapacityPerSlot', VALIDATION_RULES.maxCapacityPerSlot, reservationApplies),
            field('maxAdvanceBookingDays', VALIDATION_RULES.maxAdvanceBookingDays, reservationApplies),
            field('bookingDeadlineHours', [], reservationApplies), field('autoApprovalEnabled'),
            field('allowDuplicateReservation'), field('emailNotificationEnabled')] },
    { key: 'deposit', label: '노쇼 예약금·결제', title: '노쇼 예약금을 설정하실 건가요?', asset: 'edit-deposit',
        description: '예약금 사용 여부·금액과 결제 시점을 바꿔요.', applies: reservationApplies,
        fields: [field('_depositEnabled'), field('noShowDeposit', positiveDeposit, depositApplies), field('allowLatePayment'),
            field('paymentTimeoutMinutes', required('결제 마감을 선택해주세요.'), latePaymentApplies)] },
    { key: 'refund', label: '취소·환불 정책', title: '예약금을 언제까지 돌려드릴까요?', asset: 'edit-refund',
        description: '예약금의 전액·부분 환불 기준을 바꿔요.', applies: depositApplies,
        fields: [field('fullRefundDays', required('전액 환불 기준을 선택해주세요.'), depositApplies),
            field('partialRefundDays', partialRefundRules, refundWindowApplies),
            field('partialRefundRate', required('부분 환불율을 선택해주세요.'), partialRefundApplies)] },
    { key: 'identity', label: '소개·사진', title: '손님에게 가게를 소개해주세요.', asset: 'edit-identity',
        description: '가게 이름·주소·연락처·소개와 사진을 바꿔요.', applies: always,
        fields: [field('name', VALIDATION_RULES.storeName), field('address', VALIDATION_RULES.address),
            field('zipCode'), field('addressDetail'), field('latitude'), field('longitude'), field('phone', VALIDATION_RULES.phone),
            field('description', VALIDATION_RULES.description), field('mainImage'), field('detailImages'), field('imageAutoplayEnabled')] },
]);
export const STORE_EDIT_SECTIONS = Object.freeze(STORE_ONBOARDING_DOMAINS.map(domain => ({
    value: domain.key, label: domain.label, asset: domain.asset, description: domain.description,
})));
const fieldsByName = new Map(STORE_ONBOARDING_DOMAINS.flatMap(domain => domain.fields.map(spec => [spec.name, { domain, spec }])));
export const onboardingFieldRules = (name, values) => {
    const spec = fieldsByName.get(name)?.spec;
    return spec?.applies(values) ? spec.rules : [];
};
export const onboardingFieldDomain = name => fieldsByName.get(name)?.domain.key;
export const onboardingEditDestination = (name, values, mode = 'create') => {
    const domain = fieldsByName.get(name)?.domain;
    if (mode !== 'edit' && domain?.key === 'refund' && reservationApplies(values) && !depositApplies(values)) return 'deposit';
    return mode === 'edit' || domain?.applies(values) ? domain?.key : 'service';
};
const previewFields = {
    '업종': 'category', '접수 방식': 'reservationEnabled', '예약 방식': 'bookingType', '웨이팅': 'waitingIntakeMode',
    '가게 이름': 'name', '연락처': 'phone', '주소': 'address', '가게 소개': 'description',
    '대표 이미지': 'mainImage', '상세 이미지': 'detailImages', '사진 자동 넘김': 'imageAutoplayEnabled',
    '영업 시간': 'times', '브레이크 타임': 'breakTimes', '정기 휴무': 'closedDays', '임시 휴무일': 'closedDates',
    '운영 기간': 'operatingPeriod', '우리동네 배지 기준': 'nearbyRadiusKm', '예약 승인': 'autoApprovalEnabled',
    '최대 인원': 'maxCapacityPerSlot', '중복 예약': 'allowDuplicateReservation', '예약 알림 메일': 'emailNotificationEnabled',
    '노쇼 예약금': 'noShowDeposit', '환불 정책': 'fullRefundDays', '결제 마감': 'paymentTimeoutMinutes',
    '나중 결제': 'allowLatePayment', '예약 범위': 'maxAdvanceBookingDays', '예약 마감': 'bookingDeadlineHours', '예약 단위': 'bookingType',
};
export const onboardingPreviewDestination = (label, values, mode) => onboardingEditDestination(previewFields[label], values, mode);

export const STORE_EDIT_SELECTION_HELP = '바꿀 항목을 선택해주세요. 수정한 내용은 미리보기에서 확인하고 수정 완료로 저장해요.';

export const onboardingSteps = (values, mode = 'create') => [
    ...(mode === 'edit' ? [{ key: 'selection', title: '무엇을 수정하시겠어요?', fields: [] }] : []),
    ...STORE_ONBOARDING_DOMAINS.filter(domain => mode === 'edit' || domain.applies(values)).map(domain => ({
        key: domain.key, title: domain.title, fields: domain.fields.filter(spec => spec.applies(values)).map(spec => spec.name),
    })),
    { key: 'review', title: '손님에게 이렇게 보여요.', fields: [] },
];

export const migrateOnboardingDraft = (values = {}, mode = 'create') => {
    const next = { ...values };
    if (next._onboardingVersion !== 2) {
        // 이전 직렬화기는 누락된 날짜 필드도 undefined로 추가했다. 서버 기준값을 지우지 않는다.
        for (const name of ['times', 'breakTimes', 'operatingPeriod', 'closedDays', 'closedDates', 'sessionTimes', 'maxCapacityPerSlot', 'maxAdvanceBookingDays']) {
            if (next[name] === undefined) delete next[name];
        }
    }
    const keys = new Set(['selection', 'review', ...STORE_ONBOARDING_DOMAINS.map(domain => domain.key)]);
    if (next._onboardingStep && !keys.has(next._onboardingStep)) next._onboardingStep = mode === 'edit' ? 'selection' : 'industry';
    if (Array.isArray(next._onboardingHistory)) next._onboardingHistory = next._onboardingHistory.filter(key => keys.has(key));
    if (next.bookingDeadlineHours == null) next.bookingDeadlineHours = 0;
    const active = onboardingSteps({ ...STORE_ONBOARDING_DEFAULTS, ...next }, mode);
    if (next._onboardingStep && !active.some(step => step.key === next._onboardingStep)) {
        const previousIndex = STORE_ONBOARDING_DOMAINS.findIndex(domain => domain.key === next._onboardingStep);
        next._onboardingStep = active.find(step => STORE_ONBOARDING_DOMAINS.findIndex(domain => domain.key === step.key) > previousIndex)?.key ?? 'review';
    }
    next._onboardingVersion = 2;
    return next;
};

export const normalizeOnboardingSubmission = (values, mode = 'create') => ({
    ...values,
    noShowDeposit: mode === 'create' && !reservationApplies(values) || !depositSelected(values) ? 0 : values.noShowDeposit ?? 0,
    allowLatePayment: depositSelected(values) && Number(values.noShowDeposit) > 0 ? Boolean(values.allowLatePayment) : false,
    bookingDeadlineHours: values.bookingDeadlineHours ?? 0,
});

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
    noShowDeposit: !depositApplies(values) ? 0 : values.noShowDeposit || 0,
    allowLatePayment: depositApplies(values) && Number(values.noShowDeposit) > 0 && Boolean(values.allowLatePayment),
    maxCapacityPerSlot: values.maxCapacityPerSlot ?? null,
});
