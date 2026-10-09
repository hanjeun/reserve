import { AppstoreOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, CreditCardOutlined, EnvironmentOutlined, FieldTimeOutlined, FileTextOutlined, HourglassOutlined, MailOutlined, PhoneOutlined, PictureOutlined, QrcodeOutlined, RollbackOutlined, ShopOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button } from '../../common';
import StoreInfoSection from '../StoreInfoSection';
import { intakeService, onboardingPreviewStore, onboardingPreviewDestination } from '../../../utils/storeOnboarding';
import { SERVICE_DOMAIN_OPTIONS, BOOKING_TYPE_OPTIONS, NEARBY_RADIUS_OPTIONS } from '../../../constants';
import { SERVICE_OPTIONS, PAUSED_SERVICE, WAITING_OPTIONS } from './questionOptions';
export function RegistrationSummary({ values, goTo, imageCounts = { main: 0, detail: 0 }, disabled = false, mode = 'create' }) {
    const enabled = values.reservationEnabled !== false;
    const store = onboardingPreviewStore(values, []);
    const paid = enabled && Number(store.noShowDeposit) > 0;
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
        const detail = (label, Icon, fallback) => ({
            ...(detailRows.get(label) || { Icon, label, value: fallback }),
        });
        const bookingDetail = (label, Icon, fallback) => enabled
            ? detail(label, Icon, fallback) : { Icon, label, value: '사용 안 함' };
        return [
            { Icon: ShopOutlined, label: '업종', value: enteredText(category)},
            { Icon: AppstoreOutlined, label: '접수 방식', value: paused ? PAUSED_SERVICE.label : SERVICE_OPTIONS.find(option => option.value === intakeService(values))?.label || '작성 안 됨'},
            { Icon: CalendarOutlined, label: '예약 방식', value: enabled ? BOOKING_TYPE_OPTIONS.find(option => option.value === values.bookingType)?.label || '작성 안 됨' : '사용 안 함'},
            { Icon: QrcodeOutlined, label: '웨이팅', value: waitingLabel || '사용 안 함'},
            { Icon: ShopOutlined, label: '가게 이름', value: enteredText(values.name)},
            { Icon: PhoneOutlined, label: '연락처', value: enteredText(values.phone)},
            detail('주소', EnvironmentOutlined, '작성 안 됨'),
            { Icon: FileTextOutlined, label: '가게 소개', value: enteredText(values.description)},
            { Icon: PictureOutlined, label: '대표 이미지', value: imageCounts.main ? `${imageCounts.main}장` : '작성 안 됨'},
            { Icon: PictureOutlined, label: '상세 이미지', value: imageCounts.detail ? `${imageCounts.detail}장` : '없음'},
            { Icon: PictureOutlined, label: '사진 자동 넘김', value: values.imageAutoplayEnabled !== false ? '켜짐' : '꺼짐'},
            detail('영업 시간', ClockCircleOutlined, '작성 안 됨'),
            { Icon: ClockCircleOutlined, label: '브레이크 타임', value: enabled && values.bookingType === 'SLOT' ? breakTime : '사용 안 함'},
            detail('정기 휴무', ClockCircleOutlined, '없음'),
            { Icon: CalendarOutlined, label: '임시 휴무일', value: store.closedDates.filter(Boolean).join(' · ') || '없음'},
            detail('운영 기간', FieldTimeOutlined, '제한 없음'),
            { Icon: EnvironmentOutlined, label: '우리동네 배지 기준', value: NEARBY_RADIUS_OPTIONS.find(option => option.value === values.nearbyRadiusKm)?.label || '작성 안 됨'},
            { Icon: CheckCircleOutlined, label: '예약 승인', value: enabled ? values.autoApprovalEnabled ? '자동 승인해요.' : '사업자가 확인 후 승인해요.' : '사용 안 함'},
            bookingDetail('최대 인원', TeamOutlined, '제한 없음'),
            { Icon: TeamOutlined, label: '중복 예약', value: enabled ? values.allowDuplicateReservation ? '허용' : '허용 안 함' : '사용 안 함'},
            { Icon: MailOutlined, label: '예약 알림 메일', value: enabled ? values.emailNotificationEnabled ? '켜짐' : '꺼짐' : '사용 안 함'},
            bookingDetail('노쇼 예약금', CreditCardOutlined, '없음'),
            bookingDetail('환불 정책', RollbackOutlined, paid ? '환불 불가' : '예약금 없음'),
            bookingDetail('결제 마감', ThunderboltOutlined, paid ? store.allowLatePayment ? '제한 없음' : '신청할 때 결제' : '예약금 없음'),
            { Icon: CreditCardOutlined, label: '나중 결제', value: paid ? values.allowLatePayment ? '허용' : '허용 안 함' : enabled ? '예약금 없음' : '사용 안 함'},
            bookingDetail('예약 범위', FieldTimeOutlined, '제한 없음'),
            bookingDetail('예약 마감', FieldTimeOutlined, '제한 없음'),
            bookingDetail('예약 단위', HourglassOutlined, '작성 안 됨'),
        ].map(row => ({...row, step: onboardingPreviewDestination(row.label, values, mode)}));
    };
    return <section className="reserve-onboarding-summary" aria-label="가게 설정">
        {/* Reuse customer detail values, with break time in its own editable row. */}
        <StoreInfoSection store={{ ...store, breakStartTime: null, breakEndTime: null }} transformRows={rows}
            renderAction={row => <Button variant="ghost-sm" size="sm" htmlType="button" disabled={disabled}
                onClick={() => goTo(row.step)} aria-label={`${row.label} 수정`}>수정</Button>} />
    </section>;
}
