import React from 'react';
import { Form, Flex, Switch, Typography } from 'antd';
import { FormInput, FormTextArea, FormSelect, FormTimePicker } from '../../common';
import {
    STORE_CATEGORIES, RESERVATION_SLOT_OPTIONS,
    FULL_REFUND_DAYS_OPTIONS, PARTIAL_REFUND_DAYS_OPTIONS, PARTIAL_REFUND_RATE_OPTIONS,
    BOOKING_DEADLINE_OPTIONS, PAYMENT_TIMEOUT_OPTIONS,
} from '../../../constants';
import { VALIDATION_RULES } from '../../../utils/validation';
import { colors, fontSize, fontWeight } from '../../../styles/tokens';

const { Text } = Typography;

// Form.Item marginBottom: PC에서는 오른쪽 컬럼과 간격 맞추기 위해 12px, 모바일은 18px
const MB     = { marginBottom: 18 }; // 모바일/기본
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
    <div style={toggleStyles.row}>
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

// 2-셀 Flex Row
const FieldRow = ({ children, style }) => (
    <Flex gap={12} style={{ marginBottom: 18, ...style }}>
        {React.Children.map(children, child =>
            React.cloneElement(child, { style: { flex: 1, marginBottom: 0, ...child.props.style } })
        )}
    </Flex>
);

// 기본 정보 (왼쪽 컬럼)
const BasicSection = ({ isMobile = true }) => {
    const mb = isMobile ? MB : MB_PC;
    return (
        <>
            <Form.Item label="가게 이름" name="name" rules={VALIDATION_RULES.storeName} style={mb}>
                <FormInput placeholder="식당 명칭" />
            </Form.Item>

            <FieldRow style={isMobile ? {} : { marginBottom: 12 }}>
                <Form.Item
                    label="카테고리" name="category" rules={VALIDATION_RULES.category}
                >
                    <FormSelect placeholder="선택" options={STORE_CATEGORIES} />
                </Form.Item>
                <Form.Item
                    label="예약 단위" name="reservationSlotMinutes"
                    rules={[{ required: true, message: '예약 단위를 선택해주세요.' }]}
                    extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>시간 선택 시 간격 단위</Text>}
                >
                    <FormSelect options={RESERVATION_SLOT_OPTIONS} placeholder="선택" />
                </Form.Item>
            </FieldRow>

            <Form.Item label="연락처" name="phone" rules={VALIDATION_RULES.phone} style={mb}>
                <FormInput placeholder="02-000-0000" />
            </Form.Item>

            <FieldRow style={isMobile ? {} : { marginBottom: 12 }}>
                <Form.Item label="영업 시간" name="times" rules={VALIDATION_RULES.businessHours}>
                    <FormTimePicker.RangePicker
                        placeholder={['시작 시간', '종료 시간']}
                    />
                </Form.Item>
                <Form.Item
                    label="브레이크 타임"
                    name="breakTimes"
                    extra={<Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>브레이크 없으면 비워두세요</Text>}
                >
                    <FormTimePicker.RangePicker
                        placeholder={['시작', '종료']}
                    />
                </Form.Item>
            </FieldRow>

            <Form.Item label="주소" name="address" rules={VALIDATION_RULES.address} style={mb}>
                <FormInput placeholder="상세 주소" />
            </Form.Item>

            <Form.Item label="가게 소개" name="description" rules={VALIDATION_RULES.description} style={{ marginBottom: 0 }}>
                <FormTextArea rows={4} placeholder="가게를 소개해주세요" />
            </Form.Item>
        </>
    );
};

// 운영 설정 (오른쪽 컬럼)
const SettingsSection = () => (
    <>
        <FieldRow>
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
                <FormInput type="number" placeholder="0" suffix="원" min={0} max={100000} precision={0} />
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
        <SectionLabel>환불 정책</SectionLabel>
        <FieldRow style={{ marginBottom: 12 }}>
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

        <FieldRow style={{ marginBottom: 0 }}>
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
const StoreBasicInfo = ({ isMobile = true }) => {
    if (!isMobile) {
        return (
            <div style={pcStyles.grid}>
                <div style={pcStyles.col}><BasicSection isMobile={false} /></div>
                <div style={pcStyles.dividerVertical} />
                <div style={pcStyles.col}><SettingsSection /></div>
            </div>
        );
    }
    return (
        <>
            <BasicSection />
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
