import { useState } from 'react';
import dayjs from 'dayjs';
import { Checkbox, Form, Input, Switch } from 'antd';
import { AppstoreOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, CreditCardOutlined, DownOutlined, EnvironmentOutlined, FieldTimeOutlined, FileTextOutlined, GlobalOutlined, HourglassOutlined, MailOutlined, MobileOutlined, PhoneOutlined, PictureOutlined, QrcodeOutlined, RollbackOutlined, ScheduleOutlined, ShopOutlined, StopOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, FormDatePicker, FormInput, FormSelect, FormTextArea, FormTimePicker } from '../common';
import AddressSearch from './StoreForm/AddressSearch';
import StoreImages from './StoreForm/StoreImages';
import StoreInfoSection from './StoreInfoSection';
import ServiceDomainPicker from './ServiceDomainPicker';
import RollingFormInput from '../common/RollingFormInput';
import IconChoicePicker from '../common/IconChoicePicker';
import { VALIDATION_RULES } from '../../utils/validation';
import {
    SERVICE_DOMAIN_OPTIONS, RESERVATION_SLOT_OPTIONS, BOOKING_TYPE_OPTIONS,
    FULL_REFUND_DAYS_OPTIONS, PARTIAL_REFUND_DAYS_OPTIONS, PARTIAL_REFUND_RATE_OPTIONS,
    PAYMENT_TIMEOUT_OPTIONS, BOOKING_DEADLINE_OPTIONS, NEARBY_RADIUS_OPTIONS,
} from '../../constants';
import { intakeService, onboardingPreviewStore, STORE_ONBOARDING_DEFAULTS } from '../../utils/storeOnboarding';

const SERVICE_OPTIONS = [
    { value: 'reservation', label: '예약', asset: 'intake-reservation', icon: <CalendarOutlined />, description: '날짜나 시간을 미리 선택해 방문해요.' },
    { value: 'waiting', label: '웨이팅', asset: 'intake-waiting', icon: <ClockCircleOutlined />, description: '대기 명단에 접수하고 순서대로 입장해요.' },
    { value: 'both', label: '예약 · 웨이팅', asset: 'intake-both', icon: <AppstoreOutlined />, description: '두 방식으로 손님을 받아요.' },
];
const PAUSED_SERVICE = { value: 'paused', label: '접수 중지', asset: 'intake-paused', icon: <StopOutlined />, description: '새 예약과 웨이팅 접수를 꺼요. 기존 설정은 유지해요.' };
const BOOKING_OPTIONS = [
    { value: 'SLOT', label: '시간대', asset: 'booking-slot', icon: <ClockCircleOutlined />, description: '예: 오전 10시 미용실 예약. 영업시간을 일정한 간격으로 나눠요.' },
    { value: 'SESSION', label: '회차제', asset: 'booking-session', icon: <ScheduleOutlined />, description: '예: 11시·14시 클래스. 정해둔 회차만 선택해요.' },
    { value: 'DAY', label: '날짜만', asset: 'booking-day', icon: <CalendarOutlined />, description: '예: 종일권·팝업 방문. 날짜만 선택하고 시간은 고르지 않아요.' },
];
const WAITING_OPTIONS = [
    { value: 'ONSITE', label: '현장 QR', asset: 'waiting-onsite', icon: <QrcodeOutlined />, description: '가게에 온 손님이 현장 QR을 스캔해 접수해요.' },
    { value: 'REMOTE', label: '원격', asset: 'waiting-remote', icon: <MobileOutlined />, description: '손님이 가게 상세에서 미리 접수해요.' },
    { value: 'BOTH', label: '현장 QR · 원격', asset: 'waiting-both', icon: <GlobalOutlined />, description: '현장과 원격 접수를 같은 대기 명단으로 받아요.' },
];
const WAITING_OFF = { value: 'OFF', label: '사용 안 함', asset: 'waiting-off', icon: <StopOutlined />, description: '웨이팅 접수를 받지 않아요.' };
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const required = message => [{ required: true, message }];
const industryValues = values => ({ serviceDomain: values.serviceDomain, category: values.category });
const bookingValues = values => ({ reservationEnabled: values.reservationEnabled, bookingType: values.bookingType });
const operationValues = values => ({ ...bookingValues(values), noShowDeposit: values.noShowDeposit });
const identityValues = values => ({ zipCode: values.zipCode, addressDetail: values.addressDetail });
const useQuestionValues = selector => {
    const form = Form.useFormInstance();
    const watched = Form.useWatch(selector, { form, preserve: true });
    return { ...STORE_ONBOARDING_DEFAULTS, ...watched };
};

export function IndustryQuestion({ change }) {
    const values = useQuestionValues(industryValues);
    const [replacementKey, setReplacementKey] = useState(0);
    const selectedLabel = SERVICE_DOMAIN_OPTIONS.find(option => option.value === values.serviceDomain)?.label;
    const selectIndustry = serviceDomain => {
        const category = SERVICE_DOMAIN_OPTIONS.find(option => option.value === serviceDomain)?.label;
        setReplacementKey(key => key + 1);
        change({ serviceDomain, category });
    };
    return <>
        <Form.Item label="서비스 분야" name="serviceDomain" rules={required('서비스 분야를 선택해주세요.')}>
            <ServiceDomainPicker selectedValue={values.category === selectedLabel ? values.serviceDomain : null} onChange={selectIndustry} />
        </Form.Item>
        <Form.Item label="업종" name="category" rules={VALIDATION_RULES.category}
            extra="조금 더 구체적으로 알려주세요. 예: 필라테스, 네일샵, 한식">
            <RollingFormInput replacementKey={replacementKey}
                replacementOrder={SERVICE_DOMAIN_OPTIONS.findIndex(option => option.value === values.serviceDomain)}
                placeholder="업종" maxLength={30} />
        </Form.Item>
    </>;
}

export function ServiceQuestion({ values, change, disabled, mode = 'create' }) {
    const select = service => change({ reservationEnabled: service !== 'waiting' && service !== 'paused',
        waitingIntakeMode: service === 'reservation' || service === 'paused' ? 'OFF'
            : values.waitingIntakeMode && values.waitingIntakeMode !== 'OFF' ? values.waitingIntakeMode : 'ONSITE' });
    const paused = mode === 'edit' && values.reservationEnabled === false && values.waitingIntakeMode === 'OFF';
    return <>
        <IconChoicePicker label="손님 접수 방식" value={paused ? 'paused' : intakeService(values)} onChange={select}
            options={mode === 'edit' ? [...SERVICE_OPTIONS, PAUSED_SERVICE] : SERVICE_OPTIONS} disabled={disabled} showDescription />
        <p className="reserve-onboarding-help">{mode === 'edit' ? '기존 예약·웨이팅 설정은 각 항목에서 계속 수정할 수 있어요.' : '운영 방식은 등록 후에도 바꿀 수 있어요.'}</p>
        <Form.Item name="reservationEnabled" hidden><Input /></Form.Item>
    </>;
}

export function BookingQuestion({ mode = 'create' }) {
    const values = useQuestionValues(bookingValues);
    const enabled = mode === 'edit' || values.reservationEnabled !== false;
    return <>
        <Form.Item name="bookingType" label="예약 방식">
            <IconChoicePicker label="예약 방식" options={BOOKING_OPTIONS} showDescription />
        </Form.Item>
        <Form.Item label="시간 선택 간격" name="reservationSlotMinutes"
            hidden={!enabled || values.bookingType !== 'SLOT'}
            rules={enabled && values.bookingType === 'SLOT' ? required('시간 선택 간격을 선택해주세요.') : []}>
            <FormSelect options={RESERVATION_SLOT_OPTIONS} />
        </Form.Item>
        <Form.Item label="회차 시각" name="sessionTimes" hidden={!enabled || values.bookingType !== 'SESSION'}
            rules={enabled && values.bookingType === 'SESSION' ? required('회차를 하나 이상 등록해주세요.') : []}
            extra="손님은 여기에 등록한 회차 중에서 선택해요.">
            <FormTimePicker multiple placeholder="회차 시각 선택" />
        </Form.Item>
    </>;
}

export function WaitingQuestion({ mode = 'create' }) {
    return <>
        <Form.Item label="웨이팅 접수 방식" name="waitingIntakeMode">
            <IconChoicePicker label="웨이팅 접수 방식" options={mode === 'edit' ? [WAITING_OFF, ...WAITING_OPTIONS] : WAITING_OPTIONS} showDescription />
        </Form.Item>
        <p className="reserve-onboarding-help">사업자 패널의 웨이팅 탭에서 접수를 시작·중지하고 손님을 호출해요. 직원이 접수한 손님도 같은 명단에 표시돼요.</p>
    </>;
}

function DepositFields({ values, mode }) {
    const enabled = mode === 'edit' || values.reservationEnabled !== false;
    const paid = enabled && Number(values.noShowDeposit) > 0;
    const policyRequired = mode === 'edit' || paid;
    return <>
        <Form.Item label="노쇼 예약금" name="noShowDeposit" hidden={!enabled}
            rules={enabled ? VALIDATION_RULES.noShowDeposit : []} extra="0원이면 예약금 없이 받아요.">
            <FormInput type="number" min={0} max={100000} precision={0} step={1000} suffix="원"
                formatter={value => value == null || value === '' ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={value => value?.replaceAll(',', '')} />
        </Form.Item>
        <div className="reserve-onboarding-fields" hidden={!policyRequired}>
            <Form.Item label="전액 환불 기준" name="fullRefundDays" rules={policyRequired ? required('전액 환불 기준을 선택해주세요.') : []}>
                <FormSelect options={FULL_REFUND_DAYS_OPTIONS} />
            </Form.Item>
            <Form.Item label="부분 환불 기준" name="partialRefundDays" rules={policyRequired ? required('부분 환불 기준을 선택해주세요.') : []}>
                <FormSelect options={PARTIAL_REFUND_DAYS_OPTIONS} />
            </Form.Item>
            <Form.Item label="부분 환불율" name="partialRefundRate" rules={policyRequired ? required('부분 환불율을 선택해주세요.') : []}>
                <FormSelect options={PARTIAL_REFUND_RATE_OPTIONS} />
            </Form.Item>
            <Form.Item label="결제 마감" name="paymentTimeoutMinutes" rules={policyRequired ? required('결제 마감을 선택해주세요.') : []}>
                <FormSelect options={PAYMENT_TIMEOUT_OPTIONS} />
            </Form.Item>
        </div>
    </>;
}

export function OperationQuestion({ mode = 'create' }) {
    const values = useQuestionValues(operationValues);
    const [advancedOpen, setAdvancedOpen] = useState(true);
    const enabled = mode === 'edit' || values.reservationEnabled !== false;
    const isSlot = enabled && values.bookingType === 'SLOT';
    const capacityLabel = { SLOT: '한 시간대', SESSION: '한 회차', DAY: '하루' }[values.bookingType] || '한 시간대';
    return <>
        <Form.Item label="영업 시간" name="times" rules={VALIDATION_RULES.businessHours}
            extra={values.bookingType === 'SESSION' && enabled ? '가게 정보에 보여주는 시간이에요. 예약은 회차 시각으로 받아요.' : undefined}>
            <FormTimePicker.RangePicker placeholder={['시작 시간', '종료 시간']} />
        </Form.Item>
        <Form.Item label="최대 예약 인원" name="maxCapacityPerSlot" hidden={!enabled}
            rules={enabled ? VALIDATION_RULES.maxCapacityPerSlot : []}
            extra={`${capacityLabel}에 받는 인원 합계예요. 비워두면 제한 없이 받아요.`}>
            <FormInput type="number" min={1} max={999} precision={0} suffix="명" placeholder="제한 없음" />
        </Form.Item>
        <DepositFields values={values} mode={mode} />
        <Form.Item label="정기 휴무" name="closedDays" extra="선택하지 않으면 매일 운영해요.">
            <Checkbox.Group className="reserve-weekday-group" options={WEEKDAYS.map((label, index) => ({ label, value: index + 1 }))} />
        </Form.Item>
        <details className="reserve-onboarding-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
            <summary><DownOutlined className="reserve-filter-menu-chevron" aria-hidden="true" /><span>세부 운영 설정</span></summary>
            <div>
                <Form.Item label="브레이크 타임" name="breakTimes" hidden={!isSlot}
                    dependencies={['times']} rules={isSlot ? VALIDATION_RULES.breakTimes : []}>
                    <FormTimePicker.RangePicker placeholder={['시작 시간', '종료 시간']} />
                </Form.Item>
                <Form.Item label="운영 기간" name="operatingPeriod" extra="기간이 정해진 가게만 선택해주세요. 비워두면 계속 운영해요.">
                    <FormDatePicker.RangePicker allowEmpty={[true, true]} highlightHolidays />
                </Form.Item>
                <Form.Item label="임시 휴무일" name="closedDates"><FormDatePicker multiple highlightHolidays
                    disabledDate={mode === 'edit' ? value => value?.isBefore(dayjs().startOf('day')) : undefined} /></Form.Item>
                <Form.Item label="우리동네 배지 기준" name="nearbyRadiusKm" rules={required('반경을 선택해주세요.')}
                    extra="0이면 우리동네 배지를 표시하지 않아요.">
                    <FormSelect options={NEARBY_RADIUS_OPTIONS} />
                </Form.Item>
                <div hidden={!enabled}>
                    <Form.Item label="예약 가능 기간" name="maxAdvanceBookingDays" rules={enabled ? VALIDATION_RULES.maxAdvanceBookingDays : []}
                        extra="오늘부터 며칠 뒤까지 받을지 정해요. 비워두면 제한이 없어요.">
                        <FormInput type="number" min={1} max={365} precision={0} suffix="일" placeholder="제한 없음" />
                    </Form.Item>
                    <Form.Item label="예약 마감" name="bookingDeadlineHours" rules={mode === 'edit' ? required('예약 마감을 선택해주세요.') : []}>
                        <FormSelect options={BOOKING_DEADLINE_OPTIONS} placeholder="제한 없음" />
                    </Form.Item>
                    <Form.Item label="예약 자동 승인" name="autoApprovalEnabled" valuePropName="checked"
                        extra="끄면 사업자가 확인한 뒤 승인해요."><Switch /></Form.Item>
                    <Form.Item label="중복 예약 허용" name="allowDuplicateReservation" valuePropName="checked"
                        extra="끄면 한 손님은 같은 날 한 건만 예약할 수 있어요."><Switch /></Form.Item>
                    <Form.Item label="예약 알림 메일" name="emailNotificationEnabled" valuePropName="checked"><Switch /></Form.Item>
                    <Form.Item label="나중 결제 허용" name="allowLatePayment" valuePropName="checked" hidden={mode !== 'edit' && !Number(values.noShowDeposit)}
                        extra="예약금이 있어도 먼저 예약하고 나중에 결제할 수 있어요."><Switch /></Form.Item>
                </div>
            </div>
        </details>
    </>;
}

export function IdentityQuestion({ change, mode = 'create', ...images }) {
    const values = useQuestionValues(identityValues);
    return <>
        <Form.Item label="가게 이름" name="name" rules={VALIDATION_RULES.storeName}><FormInput placeholder="가게 이름" /></Form.Item>
        <Form.Item label="주소" name="address" rules={VALIDATION_RULES.address}>
            <AddressSearch zipCode={values.zipCode || ''} addressDetail={values.addressDetail || ''}
                onMeta={change} onDetailChange={addressDetail => change({ addressDetail })} />
        </Form.Item>
        {['latitude', 'longitude', 'zipCode', 'addressDetail'].map(name => <Form.Item key={name} name={name} hidden><Input /></Form.Item>)}
        <Form.Item label="연락처" name="phone" rules={VALIDATION_RULES.phone}><FormInput placeholder="02-1234-5678" /></Form.Item>
        <Form.Item label="가게 소개" name="description" rules={VALIDATION_RULES.description}><FormTextArea rows={3} placeholder="가게를 소개해주세요" /></Form.Item>
        <StoreImages {...images} mainImageRequired={mode === 'create'} />
    </>;
}

export function RegistrationSummary({ values, goTo, imageCounts = { main: 0, detail: 0 }, disabled = false, mode = 'create' }) {
    const enabled = values.reservationEnabled !== false;
    const paid = enabled && Number.isFinite(Number(values.noShowDeposit)) && Number(values.noShowDeposit) > 0;
    const store = onboardingPreviewStore(values, []);
    const bookingStep = mode === 'edit' || enabled ? 'booking' : 'service';
    const reservationStep = mode === 'edit' || enabled ? 'operation' : 'service';
    const paused = values.reservationEnabled === false && values.waitingIntakeMode === 'OFF';
    const enteredText = value => typeof value === 'string' && value.trim() ? value : '작성 안 됨';
    const domain = SERVICE_DOMAIN_OPTIONS.find(option => option.value === values.serviceDomain)?.label;
    const enteredCategory = typeof values.category === 'string' ? values.category.trim() : '';
    const category = enteredCategory ? enteredCategory === domain ? domain : [domain, enteredCategory].filter(Boolean).join(' · ') : '작성 안 됨';
    const waitingLabel = WAITING_OPTIONS.find(option => option.value === values.waitingIntakeMode)?.label;
    const breakTime = store.breakStartTime && store.breakEndTime
        ? `${store.breakStartTime.slice(0, 5)} ~ ${store.breakEndTime.slice(0, 5)}`
        : values.breakTimes?.some(Boolean) ? '작성 안 됨' : '없음';
    const rows = defaultRows => {
        const detailRows = new Map(defaultRows.map(row => [row.label, row]));
        const detail = (label, Icon, fallback, step = 'operation') => ({
            ...(detailRows.get(label) || { Icon, label, value: fallback }), step,
        });
        const bookingDetail = (label, Icon, fallback, step = reservationStep) => enabled
            ? detail(label, Icon, fallback, step) : { Icon, label, value: '사용 안 함', step };
        return [
            { Icon: ShopOutlined, label: '업종', value: enteredText(category), step: 'industry' },
            { Icon: AppstoreOutlined, label: '접수 방식', value: paused ? PAUSED_SERVICE.label : SERVICE_OPTIONS.find(option => option.value === intakeService(values))?.label || '작성 안 됨', step: 'service' },
            { Icon: CalendarOutlined, label: '예약 방식', value: enabled ? BOOKING_TYPE_OPTIONS.find(option => option.value === values.bookingType)?.label || '작성 안 됨' : '사용 안 함', step: bookingStep },
            { Icon: QrcodeOutlined, label: '웨이팅', value: waitingLabel || '사용 안 함', step: mode === 'edit' || waitingLabel ? 'waiting' : 'service' },
            { Icon: ShopOutlined, label: '가게 이름', value: enteredText(values.name), step: 'identity' },
            { Icon: PhoneOutlined, label: '연락처', value: enteredText(values.phone), step: 'identity' },
            detail('주소', EnvironmentOutlined, '작성 안 됨', 'identity'),
            { Icon: FileTextOutlined, label: '가게 소개', value: enteredText(values.description), step: 'identity' },
            { Icon: PictureOutlined, label: '대표 이미지', value: imageCounts.main ? `${imageCounts.main}장` : '작성 안 됨', step: 'identity' },
            { Icon: PictureOutlined, label: '상세 이미지', value: imageCounts.detail ? `${imageCounts.detail}장` : '없음', step: 'identity' },
            { Icon: PictureOutlined, label: '사진 자동 넘김', value: values.imageAutoplayEnabled !== false ? '켜짐' : '꺼짐', step: 'identity' },
            detail('영업 시간', ClockCircleOutlined, '작성 안 됨'),
            { Icon: ClockCircleOutlined, label: '브레이크 타임', value: enabled && values.bookingType === 'SLOT' ? breakTime : '사용 안 함', step: enabled && values.bookingType === 'SLOT' ? 'operation' : bookingStep },
            detail('정기 휴무', ClockCircleOutlined, '없음'),
            { Icon: CalendarOutlined, label: '임시 휴무일', value: store.closedDates.filter(Boolean).join(' · ') || '없음', step: 'operation' },
            detail('운영 기간', FieldTimeOutlined, '제한 없음'),
            { Icon: EnvironmentOutlined, label: '우리동네 배지 기준', value: NEARBY_RADIUS_OPTIONS.find(option => option.value === values.nearbyRadiusKm)?.label || '작성 안 됨', step: 'operation' },
            { Icon: CheckCircleOutlined, label: '예약 승인', value: enabled ? values.autoApprovalEnabled ? '자동 승인해요.' : '사업자가 확인 후 승인해요.' : '사용 안 함', step: reservationStep },
            bookingDetail('최대 인원', TeamOutlined, '제한 없음'),
            { Icon: TeamOutlined, label: '중복 예약', value: enabled ? values.allowDuplicateReservation ? '허용' : '허용 안 함' : '사용 안 함', step: reservationStep },
            { Icon: MailOutlined, label: '예약 알림 메일', value: enabled ? values.emailNotificationEnabled ? '켜짐' : '꺼짐' : '사용 안 함', step: reservationStep },
            bookingDetail('노쇼 예약금', CreditCardOutlined, '없음'),
            bookingDetail('환불 정책', RollbackOutlined, paid ? '환불 불가' : '예약금 없음'),
            bookingDetail('결제 마감', ThunderboltOutlined, paid ? '작성 안 됨' : '예약금 없음'),
            { Icon: CreditCardOutlined, label: '나중 결제', value: paid ? values.allowLatePayment ? '허용' : '허용 안 함' : enabled ? '예약금 없음' : '사용 안 함', step: reservationStep },
            bookingDetail('예약 범위', FieldTimeOutlined, '제한 없음'),
            bookingDetail('예약 마감', FieldTimeOutlined, '제한 없음'),
            bookingDetail('예약 단위', HourglassOutlined, '작성 안 됨', bookingStep),
        ];
    };
    return <section className="reserve-onboarding-summary" aria-label="가게 설정">
        {/* Reuse customer detail values, with break time in its own editable row. */}
        <StoreInfoSection store={{ ...store, breakStartTime: null, breakEndTime: null }} transformRows={rows}
            renderAction={row => <Button variant="ghost-sm" size="sm" htmlType="button" disabled={disabled}
                onClick={() => goTo(row.step)} aria-label={`${row.label} 수정`}>수정</Button>} />
    </section>;
}
