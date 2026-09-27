import React from 'react';
import dayjs from 'dayjs';
import { Form, Flex, Input, Switch, Typography, Checkbox } from 'antd';
import { FormDatePicker, FormInput, FormTextArea, FormSelect, FormTimePicker } from '../../common';
import AddressSearch from './AddressSearch';
import {
    RESERVATION_SLOT_OPTIONS, NEARBY_RADIUS_OPTIONS,
    FULL_REFUND_DAYS_OPTIONS, PARTIAL_REFUND_DAYS_OPTIONS, PARTIAL_REFUND_RATE_OPTIONS,
    BOOKING_DEADLINE_OPTIONS, PAYMENT_TIMEOUT_OPTIONS,
    BOOKING_TYPE_OPTIONS, BOOKING_TYPE_HINTS,
    SERVICE_DOMAIN_OPTIONS,
} from '../../../constants';
import { VALIDATION_RULES } from '../../../utils/validation';
import { useWindowWidth } from '../../../hooks';
import { colors, fontSize, fontWeight } from '../../../styles/tokens';

const { Text } = Typography;

// 모바일·PC 필드 간격을 같은 작업 폼 기준으로 맞춘다. Core 폼 자체는 변경하지 않는다.
const MB     = { marginBottom: 12 }; // 모바일/기본
const MB_PC  = { marginBottom: 12 }; // PC 왼쪽 컬럼 (오른쪽 기준 맞춤)

// 섹션 헤더
const SectionLabel = ({ children }) => (
    <div style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary, fontWeight: fontWeight.medium }}>
            {children}
        </Text>
    </div>
);

// 섹션 구분선
const Divider = ({ top = 4, bottom = 16 }) => (
    <div style={{ borderTop: `1px solid ${colors.border.light}`, margin: `${top}px 0 ${bottom}px` }} />
);

// 토글 행
const ToggleItem = ({ label, desc, name }) => (
    <div className="reserve-store-form-toggle" style={toggleStyles.row}>
        <Text style={toggleStyles.label}>{label}</Text>
        <Text style={toggleStyles.desc}>{desc}</Text>
        <Form.Item name={name} valuePropName="checked" noStyle>
            <Switch size="small" />
        </Form.Item>
    </div>
);

const toggleStyles = {
    row:   { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' },
    label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary, flexShrink: 0, whiteSpace: 'nowrap' },
    desc:  { fontSize: fontSize.xs, color: colors.text.tertiary, flex: 1 },
};

/**
 * 긴 입력·시간 범위는 모바일에서 세로로 쌓는다. 짧은 정책 Select만 compact 2열을 쓴다.
 *
 * ★ 예전에는 폭과 무관하게 항상 가로였다. 이 컴포넌트를 쓰는 7곳이 전부 같은 문제를 겪었고,
 *   그중 최악은 영업시간이었다 — 360px 화면에서 칸 하나가 약 160px 인데 그 안에
 *   `[시작] → [종료]` 와 시계 아이콘이 다 들어가야 했다. 환불 정책은 3열이라 칸당 100px 미만.
 *   숫자 입력은 그럭저럭 보여도 RangePicker·Select 는 글자가 잘렸다.
 *
 * 시간 범위·긴 힌트는 여전히 한 칸의 폭을 보장한다. 짧은 환불·마감 기준만
 * compact로 표시하며 모바일 밀도는 작업 폼 전용 CSS 관문에서 정한다.
 *
 * 폭 판정을 호출부에서 prop 으로 받지 않고 여기서 하는 이유: 이 파일의 SettingsSection 은
 * isMobile 을 안 받는다. 관문 한 곳에서 정해야 7곳이 어긋나지 않는다(CLAUDE.md 설계 원칙).
 */
const FieldRow = ({ children, style, compact = false, className = '' }) => {
    const isMobile = useWindowWidth() < 768;
    // 간격은 Flex 의 gap 으로만 준다 — 자식에 marginBottom 을 쓰면 마지막 칸 뒤에도
    // 여백이 붙어 행 자신의 marginBottom 과 겹친다(아래 cloneElement 가 0 으로 덮는 이유).
    return (
        <Flex
            className={`reserve-store-form-row${compact ? ' reserve-store-form-row--compact' : ''}${className ? ` ${className}` : ''}`}
            vertical={isMobile}
            gap={12}
            style={{ marginBottom: isMobile ? 12 : 18, ...style }}
        >
            {React.Children.map(children, child =>
                React.cloneElement(child, { style: { flex: 1, minWidth: 0, marginBottom: 0, ...child.props.style } })
            )}
        </Flex>
    );
};

// 기본 정보 (왼쪽 컬럼)
const BasicSection = ({ isMobile = true, form, zipCode = '', addressDetail = '' }) => {
    const mb = isMobile ? MB : MB_PC;
    // 예약 방식에 따라 아래 칸들의 의미가 바뀐다 — 안내 문구와 회차 칸 노출을 여기서 갈라준다.
    // useWatch 를 쓰는 이유: 값이 바뀌는 즉시 다시 그려야 하는데, form.getFieldValue 는 리렌더를 안 일으킨다.
    const bookingType = Form.useWatch('bookingType', form) ?? 'SLOT';
    return (
        <>
            <Form.Item label="가게 이름" name="name" rules={VALIDATION_RULES.storeName} style={mb}>
                <FormInput placeholder="가게 이름" />
            </Form.Item>

            {/* 짧은 분류 두 칸은 모바일에서도 한 줄에 둔다. 둘 다 직접 문장을 쓰는 칸이 아니고,
                가게가 어떤 방식·분야로 예약을 받는지 함께 결정하는 구조화된 선택값이다. */}
            <FieldRow compact style={isMobile ? {} : { marginBottom: 12 }}>
                <Form.Item
                    label="예약 방식" name="bookingType"
                    extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                        {BOOKING_TYPE_HINTS[bookingType] ?? BOOKING_TYPE_HINTS.SLOT}
                    </Text>}
                >
                    <FormSelect options={BOOKING_TYPE_OPTIONS} placeholder="시간대 (기본)" />
                </Form.Item>
                <Form.Item
                    label="서비스 분야" name="serviceDomain"
                    rules={[{ required: true, message: '서비스 분야를 선택해주세요.' }]}
                    extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>손님이 찾을 때 쓰는 큰 분류예요</Text>}
                >
                    <FormSelect options={SERVICE_DOMAIN_OPTIONS} placeholder="분야 선택" />
                </Form.Item>
            </FieldRow>

            {/* 회차 목록은 SESSION 일 때만 의미가 있다. 항상 보여주면 "적었는데 안 쓰이는" 칸이 된다 —
                이 프로젝트가 죽은 검사·죽은 옵션으로 여러 번 데인 패턴이다. */}
            {bookingType === 'SESSION' && (
                <Form.Item
                    label="회차 시각" name="sessionTimes"
                    rules={[{ required: true, message: '회차를 하나 이상 등록해주세요.' }]}
                    extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                        예: 11:00, 14:00, 17:00 — 적은 시각만 예약을 받아요 (영업시간과 별개)
                    </Text>}
                    style={mb}
                >
                    <FormTimePicker multiple format="HH:mm" placeholder="회차 시각 선택"
                        style={{ width: '100%' }} maxTagCount="responsive" />
                </Form.Item>
            )}

            <Form.Item
                label="카테고리" name="category" rules={VALIDATION_RULES.category}
                extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>업종에 맞게 자유롭게 입력하세요</Text>}
                style={mb}
            >
                <FormInput placeholder="예: 필라테스, 네일샵, 한식 등" maxLength={30} />
            </Form.Item>

            <FieldRow compact style={isMobile ? {} : { marginBottom: 12 }}>
                <Form.Item
                    label="예약 단위" name="reservationSlotMinutes"
                    rules={[{ required: true, message: '예약 단위를 선택해주세요.' }]}
                    extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                        {bookingType === 'SLOT' ? '시간 선택 간격' : '시간대 방식에서 사용'}
                    </Text>}
                >
                    {/* 값은 그대로 저장한다 — SLOT 으로 되돌렸을 때 예전 설정이 살아 있어야 한다. */}
                    <FormSelect options={RESERVATION_SLOT_OPTIONS} placeholder="선택" />
                </Form.Item>

                <Form.Item label="연락처" name="phone" rules={VALIDATION_RULES.phone}>
                    {/* placeholder·에러문구·정규식이 서로 다른 말을 하면 안 된다. 셋 다 같은 예시로 맞춰둘 것. */}
                    <FormInput placeholder="02-1234-5678" />
                </Form.Item>
            </FieldRow>

            <FieldRow className="reserve-store-form-row--time" style={isMobile ? {} : { marginBottom: 12 }}>
                <Form.Item label="영업 시간" name="times" rules={VALIDATION_RULES.businessHours}>
                    <FormTimePicker.RangePicker
                        placeholder={['시작 시간', '종료 시간']}
                    />
                </Form.Item>
                <Form.Item
                    label="브레이크 타임"
                    name="breakTimes"
                    rules={VALIDATION_RULES.breakTimes}
                    // 영업시간이 바뀌면 브레이크 검증도 다시 돌아야 한다 — 안 그러면
                    // 영업시간을 줄였을 때 범위 밖이 된 브레이크가 그대로 통과한다.
                    dependencies={['times']}
                    extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>브레이크 없으면 비워두세요</Text>}
                >
                    <FormTimePicker.RangePicker
                        placeholder={['시작', '종료']}
                    />
                </Form.Item>
            </FieldRow>

            <Form.Item label="주소" name="address" rules={VALIDATION_RULES.address} style={mb}>
                <AddressSearch
                    placeholder="도로명 또는 지번 주소 입력"
                    zipCode={zipCode}
                    addressDetail={addressDetail}
                    onMeta={(meta) => form?.setFieldsValue(meta)}
                    onDetailChange={(v) => form?.setFieldsValue({ addressDetail: v })}
                />
            </Form.Item>
            <Form.Item name="latitude" hidden><Input /></Form.Item>
            <Form.Item name="longitude" hidden><Input /></Form.Item>
            <Form.Item name="zipCode" hidden><Input /></Form.Item>
            <Form.Item name="addressDetail" hidden><Input /></Form.Item>

            <Form.Item label="가게 소개" name="description" rules={VALIDATION_RULES.description} style={{ marginBottom: 0 }}>
                <FormTextArea rows={4} placeholder="가게를 소개해주세요" />
            </Form.Item>
        </>
    );
};

// 운영 설정 (오른쪽 컬럼)
const SettingsSection = () => (
    <>
        <FieldRow compact>
            <Form.Item
                label="최대 예약 인원" name="maxCapacityPerSlot"
                rules={VALIDATION_RULES.maxCapacityPerSlot}
                extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>동시간대 기준, 비워두면 무제한</Text>}
            >
                <FormInput type="number" placeholder="예) 4" suffix="명" min={1} max={999} precision={0} />
            </Form.Item>
            <Form.Item
                label="노쇼 예약금" name="noShowDeposit"
                rules={VALIDATION_RULES.noShowDeposit}
                extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>0원이면 예약금 없음</Text>}
            >
                {/* step 1000 · 천단위 콤마 — 기본 step 은 1 이라 스피너로 10,000원을 만들려면
                    1만 번을 눌러야 했다. 예약금은 천 원 단위로 정하는 값이다.
                    parser 는 콤마를 걷어내 숫자로 되돌린다(없으면 두 번째 입력부터 NaN 이 된다). */}
                <FormInput
                    type="number" placeholder="0" suffix="원"
                    min={0} max={100000} precision={0} step={1000}
                    formatter={(v) => (v == null || v === '' ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
                    parser={(v) => (v ? v.replace(/,/g, '') : v)}
                />
            </Form.Item>
        </FieldRow>

        <FieldRow>
            <Form.Item
                label="우리동네 배지 기준" name="nearbyRadiusKm"
                rules={[{ required: true, message: '기준 거리를 선택해주세요.' }]}
                extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>내 가게가 이 거리 이내면 "우리동네" 배지가 붙어요</Text>}
            >
                <FormSelect options={NEARBY_RADIUS_OPTIONS} placeholder="기준 거리 선택" />
            </Form.Item>
        </FieldRow>

        <Divider />
        <SectionLabel>운영 옵션</SectionLabel>
        <Flex vertical gap={0} style={{ marginBottom: 16 }}>
            <ToggleItem name="autoApprovalEnabled"       label="예약 자동 승인" desc="ON 시 예약 요청이 즉시 확정됩니다" />
            <ToggleItem name="allowLatePayment"          label="나중 결제 허용"  desc="예약금이 있어도 나중에 결제 가능" />
            <ToggleItem name="allowDuplicateReservation" label="중복 예약 허용"  desc="OFF 시 같은 날짜에 1인 1예약만 가능" />
            <ToggleItem name="emailNotificationEnabled"  label="예약 알림 메일"  desc="새 예약 접수 시 이메일로 알림 받기" />
        </Flex>

        <Divider />
        <SectionLabel>휴무 · 예약 범위</SectionLabel>
        {/* 2026-08-11 신설. 그 전까지 영업시간이 요일 구분 없이 하나뿐이라
            **월요일 휴무인 가게도 월요일 예약을 받았다.** 기능이 없는 게 아니라
            잘못된 예약을 받는 상태였고, 사장님이 하나씩 거절해야 했다. */}
        <Form.Item
            label="정기 휴무" name="closedDays"
            extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                선택한 요일은 예약을 받지 않아요. 안 고르면 연중무휴예요
            </Text>}
        >
            {/* ISO 요일 번호(월=1 … 일=7) — 백엔드 Store.isClosedOn 이 같은 기준으로 판정한다.
                0=일요일인 JS getDay()와 다르니 섞지 말 것. */}
            {/* className 은 index.css 의 7칸 그리드 규칙과 짝이다 —
                기본 줄바꿈에 맡기면 모바일에서 '일' 하나만 다음 줄로 떨어진다. */}
            <Checkbox.Group className="reserve-weekday-group" options={[
                { label: '월', value: 1 }, { label: '화', value: 2 }, { label: '수', value: 3 },
                { label: '목', value: 4 }, { label: '금', value: 5 }, { label: '토', value: 6 },
                { label: '일', value: 7 },
            ]} />
        </Form.Item>

        {/* 운영 기간 (2026-08-24 신설).
            휴무일과 성격이 다르다 — 휴무는 "여는 가게가 그날만 쉰다"이고,
            이건 "그 기간 밖에는 가게가 아예 없다"이다. 팝업스토어·기간 한정 클래스용.
            비워두면 지금까지와 똑같이 무기한 영업이라 기존 가게는 영향이 없다. */}
        <Form.Item
            label="운영 기간" name="operatingPeriod"
            extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                팝업스토어처럼 기간이 정해진 경우에만. 비워두면 계속 운영해요 (종료일 당일까지 예약 가능)
            </Text>}
        >
            <FormDatePicker.RangePicker
                placeholder={['시작일', '종료일']}
                allowEmpty={[true, true]}
            />
        </Form.Item>

        <FieldRow>
            <Form.Item
                label="임시 휴무일" name="closedDates"
                extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                    명절·개인 사정 등 특정 날짜만 쉴 때. 지난 날짜는 저장 시 자동으로 정리돼요
                </Text>}
            >
                <FormDatePicker
                    multiple
                    placeholder="날짜 선택"
                    disabledDate={(d) => d && d.isBefore(dayjs().startOf('day'))}
                />
            </Form.Item>
            <Form.Item
                label="예약 가능 기간" name="maxAdvanceBookingDays"
                rules={VALIDATION_RULES.maxAdvanceBookingDays}
                extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                    오늘부터 며칠 뒤까지 받을지. 비워두면 제한 없음 (최대 365일)
                </Text>}
            >
                <FormInput type="number" placeholder="예) 30" suffix="일" min={1} max={365} precision={0} />
            </Form.Item>
        </FieldRow>

        <Divider />
        <SectionLabel>환불 정책</SectionLabel>
        <FieldRow compact style={{ marginBottom: 12 }}>
            <Form.Item label="전액 환불"   name="fullRefundDays"    rules={[{ required: true, message: '전액 환불 기준을 선택해주세요.' }]}>
                <FormSelect options={FULL_REFUND_DAYS_OPTIONS}    placeholder="환불 없음" />
            </Form.Item>
            <Form.Item label="부분 환불"   name="partialRefundDays" rules={[{ required: true, message: '부분 환불 기준을 선택해주세요.' }]}>
                <FormSelect options={PARTIAL_REFUND_DAYS_OPTIONS} placeholder="적용 안 함" />
            </Form.Item>
            <Form.Item label="부분 환불율" name="partialRefundRate" rules={[{ required: true, message: '부분 환불율을 선택해주세요.' }]}>
                <FormSelect options={PARTIAL_REFUND_RATE_OPTIONS} placeholder="0%" />
            </Form.Item>
        </FieldRow>

        <FieldRow compact style={{ marginBottom: 0 }}>
            <Form.Item label="예약 마감" name="bookingDeadlineHours"    rules={[{ required: true, message: '예약 마감을 선택해주세요.' }]}>
                <FormSelect options={BOOKING_DEADLINE_OPTIONS}  placeholder="제한 없음" />
            </Form.Item>
            <Form.Item label="결제 마감" name="paymentTimeoutMinutes"   rules={[{ required: true, message: '결제 마감을 선택해주세요.' }]}>
                <FormSelect options={PAYMENT_TIMEOUT_OPTIONS}   placeholder="제한 없음" />
            </Form.Item>
        </FieldRow>
    </>
);

/**
 * 가게 기본 정보 입력 섹션
 * @param {boolean} isMobile - PC: 2컬럼 / 모바일: 단일 컬럼
 */
const StoreBasicInfo = ({ isMobile = true, form, zipCode = '', addressDetail = '' }) => {
    // 초안 복원은 Form 인스턴스에 값을 주입하므로 최초 initialValues prop만 보면 주소의
    // 보조 필드가 갱신되지 않는다. 등록·수정 모두 실제 폼 값을 구독해 AddressSearch에 전달한다.
    const watchedZipCode = Form.useWatch('zipCode', form);
    const watchedAddressDetail = Form.useWatch('addressDetail', form);
    const currentZipCode = watchedZipCode === undefined ? zipCode : watchedZipCode;
    const currentAddressDetail = watchedAddressDetail === undefined ? addressDetail : watchedAddressDetail;

    if (!isMobile) {
        return (
            <div style={pcStyles.grid}>
                <div style={pcStyles.col}><BasicSection isMobile={false} form={form} zipCode={currentZipCode} addressDetail={currentAddressDetail} /></div>
                <div style={pcStyles.dividerVertical} />
                <div style={pcStyles.col}><SettingsSection /></div>
            </div>
        );
    }
    return (
        <>
            <BasicSection form={form} zipCode={currentZipCode} addressDetail={currentAddressDetail} />
            <Divider top={8} bottom={16} />
            <SettingsSection />
        </>
    );
};

const pcStyles = {
    grid: { display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 32px', alignItems: 'start' },
    col:  { minWidth: 0 },
    dividerVertical: { background: colors.border.light, alignSelf: 'stretch' },
};

export default StoreBasicInfo;
