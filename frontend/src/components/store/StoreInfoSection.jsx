import React from 'react';
import PropTypes from 'prop-types';
import {
    CalendarOutlined, ClockCircleOutlined, CreditCardOutlined, EnvironmentOutlined,
    FieldTimeOutlined, HourglassOutlined, RollbackOutlined, TeamOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

// ─── StoreInfoSection 행 빌더 헬퍼 (모듈 레벨 — 복잡도 분산) ───

const hasPositiveNumber = value => Number.isFinite(Number(value)) && Number(value) > 0;

/** 분 단위 숫자를 "N분 / N시간 / N시간 N분" 문자열로 변환 */
const formatMinLabel = (min) => {
    if (min < 60)          return `${min}분`;
    if (min % 60 === 0)    return `${min / 60}시간`;
    return `${Math.floor(min / 60)}시간 ${min % 60}분`;
};

const buildAddressRow = (store) => {
    if (!store.address) return null;
    const full = store.addressDetail ? `${store.address} ${store.addressDetail}` : store.address;
    return { Icon: EnvironmentOutlined, label: '주소', value: full, link: `https://map.kakao.com/link/search/${encodeURIComponent(full)}` };
};

const buildHoursRow = (store) => {
    if (!store.openTime || !store.closeTime) return null;
    const base = `${store.openTime.substring(0, 5)} ~ ${store.closeTime.substring(0, 5)}`;
    const value = (store.breakStartTime && store.breakEndTime)
        ? `${base}  (브레이크 ${store.breakStartTime.substring(0, 5)} ~ ${store.breakEndTime.substring(0, 5)})`
        : base;
    return { Icon: ClockCircleOutlined, label: '영업 시간', value };
};

const buildDepositRow = (store) => {
    if (!hasPositiveNumber(store.noShowDeposit)) return null;
    return { Icon: CreditCardOutlined, label: '노쇼 예약금', value: `${Number(store.noShowDeposit).toLocaleString('ko-KR')}원 (예약 후 결제)`, highlight: true };
};

const buildOperatingPeriodRow = (store) => {
    if (!store.openDate && !store.closeDate) return null;
    let value;
    if (store.openDate && store.closeDate) value = `${store.openDate} ~ ${store.closeDate}`;
    else if (store.openDate) value = `${store.openDate}부터 운영`;
    else value = `${store.closeDate}까지 운영`;
    return { Icon: FieldTimeOutlined, label: '운영 기간', value };
};

const buildClosedDaysRow = (store) => {
    if (!store.closedDays?.length) return null;
    const labels = ['', '월', '화', '수', '목', '금', '토', '일'];
    return { Icon: ClockCircleOutlined, label: '정기 휴무', value: `매주 ${store.closedDays.map(day => labels[day]).join('·')} 휴무` };
};

const buildAdvanceBookingRow = (store) => {
    if (hasPositiveNumber(store.maxAdvanceBookingDays)) {
        return { Icon: FieldTimeOutlined, label: '예약 범위', value: `${store.maxAdvanceBookingDays}일 이내만 예약 가능` };
    }
    return null;
};

const buildRefundRow = (store) => {
    const hasRefund = hasPositiveNumber(store.fullRefundDays) || hasPositiveNumber(store.partialRefundDays);
    if (!hasPositiveNumber(store.noShowDeposit) || !hasRefund) return null;
    const parts = [];
    if (hasPositiveNumber(store.fullRefundDays)) parts.push(`방문 ${store.fullRefundDays}일 전까지 전액 환불`);
    if (hasPositiveNumber(store.partialRefundDays) && hasPositiveNumber(store.partialRefundRate)) parts.push(`방문 ${store.partialRefundDays}일 전까지 ${store.partialRefundRate}% 환불`);
    parts.push('이후 환불 불가');
    return { Icon: RollbackOutlined, label: '환불 정책', value: parts, isMultiLine: true };
};

const buildDeadlineRow = (store) => {
    if (!hasPositiveNumber(store.bookingDeadlineHours)) return null;
    return { Icon: FieldTimeOutlined, label: '예약 마감', value: `방문 ${store.bookingDeadlineHours}시간 전까지 예약 가능` };
};

const buildPaymentTimeoutRow = (store) => {
    if (!hasPositiveNumber(store.noShowDeposit) || !hasPositiveNumber(store.paymentTimeoutMinutes)) return null;
    return { Icon: ThunderboltOutlined, label: '결제 마감', value: `예약 후 ${formatMinLabel(store.paymentTimeoutMinutes)} 이내 미결제 시 자동 취소` };
};

const buildSlotRow = (store) => {
    if (store.bookingType === 'DAY') {
        return { Icon: CalendarOutlined, label: '예약 단위', value: '날짜만 선택해 예약해요.' };
    }
    if (store.bookingType === 'SESSION') {
        const times = (store.sessionTimes ?? []).filter(time => typeof time === 'string' && time.length >= 5);
        if (!times.length) return null;
        return { Icon: ClockCircleOutlined, label: '예약 단위', value: `${times.map(time => time.slice(0, 5)).join(' · ')} 회차로 예약 가능` };
    }
    const minutes = store.reservationSlotMinutes ?? 30;
    if (!hasPositiveNumber(minutes)) return null;
    return { Icon: HourglassOutlined, label: '예약 단위', value: `${formatMinLabel(minutes)} 단위로 예약 가능` };
};

const buildCapacityRow = (store) => {
    if (!hasPositiveNumber(store.maxCapacityPerSlot)) return null;
    return { Icon: TeamOutlined, label: '최대 인원', value: `${store.maxCapacityPerSlot}명` };
};

/** 행 값 렌더러 — IIFE를 컴포넌트로 대체해 StoreInfoSection 복잡도 감소 */
const RowValue = ({ row }) => {
    if (row.isMultiLine) {
        const last = row.value[row.value.length - 1];
        return row.value.map(v => (
            <div key={v} style={v === last ? { color: colors.error?.main || '#ff4d4f' } : {}}>{v}</div>
        ));
    }
    if (row.link) {
        return (
            <a href={row.link} target="_blank" rel="noopener noreferrer"
                className="reserve-store-info-link"
                style={{ color: colors.text.secondary, textDecoration: 'none', borderBottom: `1px solid ${colors.border.light}` }}>
                {row.value}
            </a>
        );
    }
    return row.value;
};

const buildStoreInfoRows = store => [
    buildAddressRow(store),
    buildHoursRow(store),
    buildOperatingPeriodRow(store),
    buildClosedDaysRow(store),
    ...(store.reservationEnabled === false ? [] : [buildAdvanceBookingRow(store), buildDepositRow(store), buildRefundRow(store),
        buildDeadlineRow(store), buildPaymentTimeoutRow(store), buildSlotRow(store), buildCapacityRow(store)]),
].filter(Boolean);

// 가게 상세 정보 섹션 — Cognitive Complexity: 30 → ~5
const StoreInfoSection = ({ store, extraRows = [], transformRows, renderAction }) => {
    const defaultRows = [...extraRows, ...buildStoreInfoRows(store)].filter(Boolean);
    const rows = transformRows ? transformRows(defaultRows) : defaultRows;

    if (rows.length === 0) return null;

    return (
        <div style={infoStyles.card}>
            {rows.map((row, i) => (
                <React.Fragment key={row.label}>
                    <div style={infoStyles.row}>
                        <row.Icon style={infoStyles.icon} />
                        <span style={infoStyles.label}>{row.label}</span>
                        <div style={{ ...infoStyles.value, ...(row.highlight ? infoStyles.highlight : {}) }}>
                            <RowValue row={row} />
                        </div>
                        {renderAction?.(row)}
                    </div>
                    {i < rows.length - 1 && <div style={infoStyles.divider} />}
                </React.Fragment>
            ))}
        </div>
    );
};

const infoStyles = {
    card: { padding: '4px 0' },
    row:  { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 0' },
    icon: { fontSize: 14, color: colors.text.tertiary, flexShrink: 0, marginTop: 3 },
    label: { fontSize: fontSize.sm, color: colors.text.tertiary, flexShrink: 0, width: 'var(--reserve-store-info-label-width, 80px)', lineHeight: '22px' },
    value: { fontSize: fontSize.sm, color: colors.text.secondary, flex: 1, minWidth: 0, overflowWrap: 'anywhere', lineHeight: '22px' },
    highlight: { color: colors.primary.main, fontWeight: fontWeight.medium },
    divider: { height: 1, background: colors.border.light },
};

StoreInfoSection.propTypes = {
    store: PropTypes.object.isRequired,
    extraRows: PropTypes.array,
    transformRows: PropTypes.func,
    renderAction: PropTypes.func,
};
RowValue.propTypes = { row: PropTypes.object.isRequired };

export default StoreInfoSection;
