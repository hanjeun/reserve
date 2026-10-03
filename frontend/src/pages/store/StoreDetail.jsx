import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { Image, Typography, Form, Carousel, Divider } from 'antd';
import {
    PlusOutlined, MinusOutlined,
    ClockCircleOutlined, CreditCardOutlined, FieldTimeOutlined,
    ThunderboltOutlined, RollbackOutlined, HourglassOutlined, TeamOutlined,
    StarFilled, EnvironmentOutlined, MessageOutlined, PhoneOutlined,
} from '@ant-design/icons';
import { PageContainer, Button, DataState, FormTextArea, FavoriteButton, Badge, KakaoMap, StoreDetailSkeleton, Bone } from '../../components/common';
import { BookingCalendar } from '../../components/store';
import StoreIdentityText from '../../components/store/StoreIdentityText';
import { ReviewList } from '../../components/review';
import { useStoreData, useMessage, usePayment, useWindowWidth, useStoreDetailActions, useStoreImageHint } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { rememberImageHints } from '../../utils/imageHintCache';
import { getDetailImageUrl } from '../../utils';
import { formatTime } from '../../utils/date';
import { isNearby } from '../../utils/distance';
import { normalizeStoreRating } from '../../utils/storeRating';
import { httpStatusOf } from '../../utils/listErrorMessage';
import useLocationStore from '../../store/useLocationStore';
import useMessengerStore from '../../store/useMessengerStore';
import { breakpoints, colors, radius, fontWeight, fontSize, heights, animation, field } from '../../styles/tokens';
import { VALIDATION_RULES } from '../../utils/validation';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import RollingFieldValue from '../../components/common/RollingFieldValue';

const { Title, Text } = Typography;

const BREAKPOINT = 900;

// 인원 수 입력 스텝퍼
const GuestCountInput = ({ value = 1, onChange }) => {
    const dec = () => { if (value > 1) onChange?.(value - 1); };
    const inc = () => { if (value < 99) onChange?.(value + 1); };
    return (
        <div style={inputStyles.wrapper}>
            <span style={inputStyles.count}><RollingFieldValue value={value}>{`${value}명`}</RollingFieldValue></span>
            <div style={inputStyles.btnGroup}>
                <button type="button" className="rsv-tap-btn" onClick={dec} style={{ ...inputStyles.btn, opacity: value <= 1 ? 0.35 : 1 }}>
                    <MinusOutlined style={{ fontSize: 12 }} />
                </button>
                <button type="button" className="rsv-tap-btn" onClick={inc} style={inputStyles.btn}>
                    <PlusOutlined style={{ fontSize: 12 }} />
                </button>
            </div>
        </div>
    );
};

const inputStyles = {
    wrapper: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: colors.gray[50], borderRadius: radius.lg,
        padding: '0 14px', height: heights.input, border: 'none',
    },
    count: { fontSize: fontSize.base, color: colors.text.primary, fontWeight: fontWeight.medium },
    btnGroup: { display: 'flex', gap: 8 },
    btn: {
        width: 32, height: 32, borderRadius: radius.md,
        background: colors.gray[100], border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: colors.text.secondary, transition: 'background 0.15s',
    },
};

// ─── StoreInfoSection 행 빌더 헬퍼 (모듈 레벨 — 복잡도 분산) ───

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
    if (store.noShowDeposit <= 0) return null;
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
    if (store.maxAdvanceBookingDays > 0) {
        return { Icon: FieldTimeOutlined, label: '예약 범위', value: `${store.maxAdvanceBookingDays}일 이내만 예약 가능` };
    }
    return null;
};

const buildRefundRow = (store) => {
    const hasRefund = store.fullRefundDays > 0 || store.partialRefundDays > 0;
    if (store.noShowDeposit <= 0 || !hasRefund) return null;
    const parts = [];
    if (store.fullRefundDays > 0)                                         parts.push(`방문 ${store.fullRefundDays}일 전까지 전액 환불`);
    if (store.partialRefundDays > 0 && store.partialRefundRate > 0)       parts.push(`방문 ${store.partialRefundDays}일 전까지 ${store.partialRefundRate}% 환불`);
    parts.push('이후 환불 불가');
    return { Icon: RollbackOutlined, label: '환불 정책', value: parts, isMultiLine: true };
};

const buildDeadlineRow = (store) => {
    if (store.bookingDeadlineHours <= 0) return null;
    return { Icon: FieldTimeOutlined, label: '예약 마감', value: `방문 ${store.bookingDeadlineHours}시간 전까지 예약 가능` };
};

const buildPaymentTimeoutRow = (store) => {
    if (store.noShowDeposit <= 0 || store.paymentTimeoutMinutes <= 0) return null;
    return { Icon: ThunderboltOutlined, label: '결제 마감', value: `예약 후 ${formatMinLabel(store.paymentTimeoutMinutes)} 이내 미결제 시 자동 취소` };
};

const buildSlotRow = (store) => ({
    Icon: HourglassOutlined,
    label: '예약 단위',
    value: `${formatMinLabel(store.reservationSlotMinutes ?? 30)} 단위로 예약 가능`,
});

const buildCapacityRow = (store) => {
    if (store.maxCapacityPerSlot <= 0) return null;
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

// 가게 상세 정보 섹션 — Cognitive Complexity: 30 → ~5
export const StoreInfoSection = ({ store }) => {
    const rows = [
        buildAddressRow(store),
        buildHoursRow(store),
        buildOperatingPeriodRow(store),
        buildClosedDaysRow(store),
        buildAdvanceBookingRow(store),
        buildDepositRow(store),
        buildRefundRow(store),
        buildDeadlineRow(store),
        buildPaymentTimeoutRow(store),
        buildSlotRow(store),
        buildCapacityRow(store),
    ].filter(Boolean);

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
    value: { fontSize: fontSize.sm, color: colors.text.secondary, flex: 1, lineHeight: '22px' },
    highlight: { color: colors.primary.main, fontWeight: fontWeight.medium },
    divider: { height: 1, background: colors.border.light },
};

const storePreviewClassNames = { popup: { root: 'reserve-image-preview reserve-store-detail-preview' } };

const rememberStorePreviewOrigin = event => {
    const source = event.target?.closest?.('.ant-image') ?? event.currentTarget;
    const rect = source?.getBoundingClientRect?.();
    if (!rect || typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--reserve-store-preview-origin-x', `${rect.left + rect.width / 2}px`);
    document.documentElement.style.setProperty('--reserve-store-preview-origin-y', `${rect.top + rect.height / 2}px`);
};

// PC·모바일의 가게명/평점/소개/빠른 연락은 같은 구조를 사용한다.
export const StoreIdentity = ({ store, nearby, canContact, onContact }) => {
    const { rating, reviewCount } = normalizeStoreRating(store.rating, store.reviewCount);
    const dialNumber = String(store.phone ?? '').replace(/[^+\d]/g, '');
    return (
        <div className="reserve-store-identity">
            <div className="reserve-store-identity-title-row">
                <Title level={1}>{store.name}</Title>
                <div className="reserve-store-identity-actions" role="group" aria-label="가게 빠른 작업">
                    <FavoriteButton storeId={store.id} size="md" appearance="plain" />
                    {canContact && onContact && (
                        <button type="button" className="reserve-store-contact-action"
                            onClick={onContact} aria-label="가게에 채팅 문의하기" title="채팅 문의">
                            <MessageOutlined aria-hidden="true" />
                        </button>
                    )}
                    {canContact && dialNumber && (
                        <a className="reserve-store-contact-action" href={`tel:${dialNumber}`}
                            aria-label={`가게에 전화하기 ${store.phone}`} title={`전화 ${store.phone}`}>
                            <PhoneOutlined aria-hidden="true" />
                        </a>
                    )}
                </div>
            </div>
            <div className="reserve-store-identity-rating">
                <StarFilled aria-hidden="true" />
                <strong>{rating.toFixed(1)}</strong>
                <span>({reviewCount.toLocaleString('ko-KR')})</span>
            </div>
            <div className="reserve-store-identity-summary">
                <StoreIdentityText category={store.category} nearby={nearby} />
                {store.description && <><span className="reserve-store-identity-separator" aria-hidden="true">·</span><p className="reserve-store-identity-description">{store.description}</p></>}
            </div>
            {store.keywords?.length > 0 && (
                <div className="reserve-store-identity-tags">
                    {store.keywords.map(kw => <Badge key={kw} variant="keyword" style={styles.identityBadge}>{kw}</Badge>)}
                </div>
            )}
        </div>
    );
};

// 예약 시간 선택 — 날짜 선택 시 GET /api/reservations/availability 조회해서 슬롯별 실시간 잔여 인원을 반영한 필 그리드로 보여준다.
// AntD FormTimePicker(시/분 스크롤 휠) 대신 네이버 예약 스타일의 pill 그리드 + scaleSpringIn 토큰으로 대체.
// Public availability includes the current reservation in capacity totals. Only the already-validated
// edit's original store/date/time may ignore that flag; the time must still exist in a successful response.
const isExistingReservationSlot = (slot, storeId, dateKey, editingReservation) => Boolean(
    editingReservation?.id != null
    && String(editingReservation.storeId) === String(storeId)
    && editingReservation.reservationDate === dateKey
    && formatTime(editingReservation.reservationTime) === slot.time
);
const isSelectableSlot = (slot, storeId, dateKey, editingReservation) =>
    slot.available === true || isExistingReservationSlot(slot, storeId, dateKey, editingReservation);

// DAY 예약 안내 문구 — 기존 예약 날짜 > 마감 > 기본 안내 순서로 고른다.
const dayBookingNotice = (existingSelection, onlySlot) => {
    if (existingSelection) return '기존 예약 날짜를 선택했어요';
    if (onlySlot?.available === false) return '이 날은 예약이 마감됐어요';
    return '이 가게는 날짜만 선택하면 돼요';
};

// 예약 시간 칸 라벨 — 예약 방식(DAY/SESSION/그 외)을 따라간다.
const reservationTimeLabel = (bookingType) => {
    if (bookingType === 'DAY') return '예약 확인';
    if (bookingType === 'SESSION') return '회차 선택';
    return '예약 시간';
};

const ExistingTimeNotice = () => (
    <p style={{ margin: '0 0 8px', fontSize: fontSize.sm, color: colors.text.tertiary }}>
        기존 예약 시간이에요. 저장할 때 예약 가능 여부를 다시 확인해요.
    </p>
);

// 수정 중이던 예약 시간은 조회 결과에 그 시간이 여전히 선택 가능할 때만 살려 둔다.
const clearUnofferedTime = (form, data, storeId, dateKey, editingReservation) => {
    const selectedTime = form?.getFieldValue('reservationTime');
    if (selectedTime && !data.some(slot => slot.time === selectedTime && isSelectableSlot(slot, storeId, dateKey, editingReservation))) {
        form?.setFields([{ name: 'reservationTime', value: undefined, errors: [] }]);
    }
};

// 날짜별 잔여 슬롯 조회 + 날짜 변경 시 시간 초기화 — TimeSlotPicker 에서 분리.
const useTimeSlotAvailability = ({ store, dateValue, form, onAvailabilityChange, editingReservation }) => {
    const [availability, setAvailability] = React.useState({ key: null, status: 'idle', slots: [] });
    const [retryCount, setRetryCount] = React.useState(0);
    const dateKey = dateValue ? dateValue.format('YYYY-MM-DD') : null;
    const storeId = store?.id;
    const requestKey = dateKey && storeId ? `${storeId}:${dateKey}` : null;
    const request = React.useMemo(() => ({ key: requestKey, form, editingReservation, onAvailabilityChange }),
        [requestKey, form, editingReservation, onAvailabilityChange]);
    const isCurrent = requestKey != null && availability.request === request;
    const loading = requestKey != null && (!isCurrent || availability.status === 'loading');
    const slots = isCurrent && availability.status === 'success' ? availability.slots : [];
    const failed = isCurrent && availability.status === 'error';
    // The displayed state and submit validator must observe the same lookup transition.
    const commitAvailability = React.useCallback(next => {
        onAvailabilityChange?.(next);
        setAvailability({ ...next, request });
    }, [onAvailabilityChange, request]);

    React.useEffect(() => {
        if (!requestKey) return;
        let cancelled = false;
        const controller = new AbortController();
        // Loading is derived from the request key; only the form's external validator needs notification.
        onAvailabilityChange?.({ key: requestKey, status: 'loading', slots: [] });
        api.get(API_ENDPOINTS.RESERVATION.AVAILABILITY, { params: { storeId, date: dateKey }, signal: controller.signal })
            .then((data) => {
                if (cancelled) return;
                if (!Array.isArray(data)) throw new Error('Invalid availability results');
                // An edit prefill survives a successful lookup only if the server still offers that time.
                clearUnofferedTime(form, data, storeId, dateKey, editingReservation);
                commitAvailability({ key: requestKey, status: 'success', slots: data });
            })
            .catch(() => {
                if (cancelled) return;
                form?.setFields([{ name: 'reservationTime', value: undefined, errors: [] }]);
                commitAvailability({ key: requestKey, status: 'error', slots: [] });
            });
        return () => { cancelled = true; controller.abort(); };
    }, [dateKey, storeId, requestKey, retryCount, form, editingReservation, commitAvailability, onAvailabilityChange]);

    // 날짜가 바뀌면 이전에 고른 시간은 무조건 초기화.
    // 2026-07 버그 수정: 예전엔 "새 날짜에 그 시간이 없거나 마감된 경우에만" 초기화해서,
    // 우연히 새 날짜에도 같은 시간대(예: 15:00)가 비어있으면 사용자가 그 날짜에 대해 한 번도
    // 클릭한 적 없는데도 계속 선택된 채로 남아있었음 — 예약은 날짜+시간이 한 세트로 재확인돼야
    // 하므로, 날짜를 바꾸면(최초 마운트 제외) 항상 시간 선택을 비워서 새 날짜에 대해 다시
    // 명시적으로 고르게 함.
    //
    // 2026-07 회귀 버그 수정: 처음엔 onChange?.(undefined)로 초기화했는데, 이건 Form.Item이
    // 자동 주입한 onChange라서 호출하는 순간 AntD가 즉시 그 필드를 재검증함(validateTrigger
    // 기본값이 onChange) — required 규칙에 걸려서 사용자가 아무것도 안 했는데 "시간을
    // 선택해주세요" 에러가 날짜 바꾸자마자 튀어나왔음. form.setFields로 값만 조용히 비우고
    // 에러도 명시적으로 지워서, 검증은 실제 제출 시에만 일어나게 함.
    // Reset the time selection only when the date actually changes (previous date -> different date).
    // A null -> date transition (user's first pick, or edit-mode prefill) must NOT reset, so a time value
    // injected by edit prefill is preserved. The old isFirstRender approach cleared the prefilled time,
    // because by the time the async prefill ran the first render had already passed.
    const prevDateKeyRef = React.useRef(null);
    React.useEffect(() => {
        const prev = prevDateKeyRef.current;
        prevDateKeyRef.current = dateKey;
        if (prev != null && prev !== dateKey) {
            form?.setFields([{ name: 'reservationTime', value: undefined, errors: [] }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateKey]);

    const retry = () => {
        commitAvailability({ key: requestKey, status: 'loading', slots: [] });
        setRetryCount(count => count + 1);
    };
    return { dateKey, storeId, loading, slots, failed, retry };
};

export const TimeSlotPicker = ({ store, dateValue, value, onChange, form, onAvailabilityChange, editingReservation }) => {
    const { dateKey, storeId, loading, slots, failed, retry } = useTimeSlotAvailability({
        store, dateValue, form, onAvailabilityChange, editingReservation,
    });

    // ── 예약 방식 DAY (2026-08-24) ────────────────────────────────────────
    // 서버가 슬롯을 딱 하나 내려준다("하루 = 슬롯 한 개"). 고를 게 없으므로 자동으로 채우고
    // 그리드 대신 안내 한 줄만 보여준다.
    //
    // ★ 시간 칸을 아예 없애지 않는 이유 — 서버는 여전히 reservationTime 을 필수로 받는다.
    //   칸을 지우면 값을 넣을 곳이 사라져서 화면마다 따로 채워 넣어야 하고, 그러면 빠뜨리는 곳이 생긴다.
    //   같은 칸을 그대로 두고 **채우는 방법만** 바꾸는 쪽이 갈라지지 않는다.
    const isDayBooking = store?.bookingType === 'DAY';
    const onlySlot = isDayBooking ? slots[0] : null;

    React.useEffect(() => {
        if (!onlySlot || !isSelectableSlot(onlySlot, storeId, dateKey, editingReservation) || value === onlySlot.time) return;
        onChange?.(onlySlot.time);
    }, [onlySlot, value, onChange, storeId, dateKey, editingReservation]);

    if (!dateKey) {
        return (
            <TimePlaceholder text={isDayBooking ? '날짜를 선택해주세요' : '날짜를 먼저 선택해주세요'} />
        );
    }
    if (loading) {
        return <TimeSlotLoading />;
    }
    if (failed) {
        return <DataState state="error" title="예약 가능한 시간을 불러오지 못했어요"
            onRetry={retry} compact />;
    }
    if (slots.length === 0) {
        return (
            <TimePlaceholder text="예약 가능한 시간이 없어요" />
        );
    }

    const existingSelection = slots.some(slot => !slot.available && slot.time === value && isExistingReservationSlot(slot, storeId, dateKey, editingReservation));
    if (isDayBooking) {
        return (
            <div>
                {existingSelection && <ExistingTimeNotice />}
                <TimePlaceholder text={dayBookingNotice(existingSelection, onlySlot)} />
            </div>
        );
    }

    const am = slots.filter((s) => Number(s.time.split(':')[0]) < 12);
    const pm = slots.filter((s) => Number(s.time.split(':')[0]) >= 12);

    return (
        <div>
            {existingSelection && <ExistingTimeNotice />}
            {am.length > 0 && (
                <TimeSlotGroup label="오전" labelStyle={timeSlotStyles.groupLabel} slots={am} value={value}
                    onChange={onChange} storeId={storeId} dateKey={dateKey} editingReservation={editingReservation} />
            )}
            {pm.length > 0 && (
                <TimeSlotGroup label="오후" labelStyle={{ ...timeSlotStyles.groupLabel, marginTop: am.length > 0 ? 14 : 0 }}
                    slots={pm} value={value}
                    onChange={onChange} storeId={storeId} dateKey={dateKey} editingReservation={editingReservation} />
            )}
        </div>
    );
};

const TimeSlotLoading = () => (
    <div role="status" aria-label="예약 가능한 시간을 불러오는 중" aria-busy="true">
        <div style={timeSlotStyles.grid} aria-hidden="true">
            {[1, 2, 3, 4].map(key => <Bone key={key} height={38} borderRadius={radius.md} />)}
        </div>
    </div>
);

// 오전/오후 한 묶음 — 라벨 한 줄 + pill 그리드.
const TimeSlotGroup = ({ label, labelStyle, slots, value, onChange, storeId, dateKey, editingReservation }) => (
    <>
        <div style={labelStyle}>{label}</div>
        <div style={timeSlotStyles.grid}>
            {slots.map((s, i) => (
                <TimeSlotPill key={s.time} slot={s} selected={value === s.time}
                    selectable={isSelectableSlot(s, storeId, dateKey, editingReservation)}
                    onClick={() => onChange?.(s.time)} delay={i * 40} />
            ))}
        </div>
    </>
);

const TimeSlotPill = ({ slot, selected, selectable, onClick, delay }) => (
    <button type="button"
        className={`rsv-tap-btn rsv-time-pill${selected ? ' rsv-selected' : ''}`}
        disabled={!selectable} onClick={onClick}
        style={{
            ...timeSlotStyles.pill,
            animation: animation.scaleSpringIn,
            animationDelay: `${delay}ms`,
        }}>
        {slot.time}
    </button>
);

/**
 * 시간 선택 자리표시자.
 *
 * ★ 2026-08-06 — 왜 컴포넌트로 뺐나
 *   이 칸은 AntD TimePicker 가 아니라 커스텀 div 다(시간은 pill 그리드로 고르므로).
 *   그래서 Form.Item 이 붙여주는 `ant-picker-status-error` 클래스가 존재하지 않았고,
 *   바로 위 "예약 날짜"(BookingCalendar)는 미입력 시 아이콘과 링이 빨개지는데
 *   "예약 시간"만 회색으로 남아 **같은 폼에서 두 칸이 다르게 반응**했다.
 *   → Form.Item.useStatus() 로 에러 상태를 직접 읽어 같은 언어로 반응시킨다.
 *
 *   타이포도 field 토큰으로 함께 맞춘다. 두 커스텀 표면 모두 글자와 아이콘 크기를 같은 값에서 읽는다.
 */
const TimePlaceholder = ({ text }) => {
    const { status } = Form.Item.useStatus();
    const isError = status === 'error';
    // 2026-09 수정 — 예전 주석은 "날짜 칸이 AntD DatePicker(filled)라 에러에도 선이 안 생기니
    // 여기도 그리지 않는다"였다. 그런데 2026-08-25에 날짜 칸이 BookingCalendar 로 바뀌면서
    // 그쪽은 빨간 링을 그리기 시작했고, 이 칸만 아이콘만 빨개져 같은 폼에서 두 칸이 다르게
    // 반응했다(사용자 제보). 링은 field.errorRing 관문 하나를 같이 쓴다.
    return (
        <div style={{
            ...timeSlotStyles.placeholder,
            ...(isError ? { boxShadow: field.errorRing } : null),
        }}>
            <span>{text}</span>
            <ClockCircleOutlined style={{
                ...timeSlotStyles.placeholderIcon,
                color: isError ? colors.error.main : colors.text.placeholder,
            }} />
        </div>
    );
};

const timeSlotStyles = {
    placeholder: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: heights.input, padding: '0 11px', boxSizing: 'border-box',
        // ★ 색을 하드코딩하지 말 것 — 여기 rgba(0,0,0,0.25)가 박혀 있어서 다크모드에서
        //   배경만 어두워지고 글자는 검은색 그대로라 "날짜를 먼저 선택해주세요"가 안 보였다.
        //   colors.*는 var(--c-...) 문자열이라 브라우저가 페인트 시점에 테마별로 해석한다.
        //   colors.text.placeholder는 AntD의 colorTextPlaceholder와 같은 값이라
        //   바로 옆 BookingCalendar의 "날짜 선택"과 톤이 정확히 일치한다.
        fontSize: fontSize.lg, fontWeight: fontWeight.regular, color: colors.text.placeholder,
        fontFamily: 'inherit',
        background: colors.gray[50], borderRadius: radius.lg,
        transition: 'box-shadow 0.2s',
    },
    /* AntD picker 의 suffix 아이콘과 같은 크기(16px). 14px 이면 날짜 칸보다 작아 보였다. */
    placeholderIcon: { fontSize: field.iconSize, color: field.placeholderColor },
    groupLabel: { fontSize: fontSize.sm, color: colors.text.tertiary, fontWeight: fontWeight.medium, marginBottom: 8 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
    pill: {
        padding: '9px 0', borderRadius: radius.md, border: 'none',
        fontSize: fontSize.sm, fontWeight: fontWeight.medium, cursor: 'pointer',
    },
};

export const ReservationPanel = ({
    store, form, onFinish, paying, isPC, isEditMode, editingReservation,
    editLoadError = null, editRetrying = false, onRetryEditLoad,
}) => {
    const dateValue = Form.useWatch('reservationDate', form);
    const timeAvailabilityRef = React.useRef({ key: /** @type {string | null} */ (null), status: 'idle', slots: [] });
    // DAY auto-fill runs in the same effect batch as lookup completion. Validation must see that
    // completion immediately, rather than the previous render's pending state.
    const handleAvailabilityChange = React.useCallback(next => { timeAvailabilityRef.current = next; }, []);
    let submitLabel = isEditMode ? '예약 변경하기' : '예약 신청하기';
    if (paying) submitLabel = '처리 중...';
    return (
    <div style={isPC ? pcFormStyles.panel : {}}>
        <Title level={3} style={{ marginTop: 0, marginBottom: 20, fontWeight: fontWeight.bold }}>
            {isEditMode ? '예약 변경하기' : '예약하기'}
        </Title>
        <Form form={form} layout="vertical" onFinish={onFinish}
            initialValues={{ guestCount: 1 }} requiredMark={false}
            style={{ fontWeight: fontWeight.medium }}>
            {/* 수정할 예약을 못 불러왔으면 빈 폼을 보여 주지 않는다. 채워지지 않은 폼에서 "변경하기"를
                누르면 새 예약을 만드는 것처럼 보인다. 재시도 뒤 prefill 이 붙도록 Form 요소는 남긴다. */}
            {isEditMode && editLoadError ? (
                <DataState state="error" kind="reservation" subject="변경할 예약 정보" error={editLoadError}
                    title="변경할 예약 정보를 불러오지 못했습니다." onRetry={onRetryEditLoad} retrying={editRetrying} />
            ) : (
                <>
                    <Form.Item label="예약 날짜" name="reservationDate"
                        rules={[{ required: true, message: '날짜를 선택해주세요.' }]}>
                        {/* ★ 2026-08-25 — AntD DatePicker 팝업에서 인라인 BookingCalendar 로 교체.
                            예전에는 disabledDate 로 막았는데 그건 **회색밖에 못 칠한다** — 정기휴무,
                            임시휴무, 운영기간 밖, 예약범위 초과, 정원 마감이 전부 같은 회색이라
                            "왜 안 눌리지"를 알 방법이 없었다. 게다가 그 다섯 판정이 서버(isBookableOn)와
                            **프론트에도 따로**(makeDisabledDate) 있어서 언젠가 어긋날 자리였다.
                            이제 사유는 서버가 내려주고 달력은 그리기만 한다. */}
                        <BookingCalendar storeId={store?.id} />
                    </Form.Item>
                    {/* 라벨·에러 문구가 예약 방식을 따라간다. DAY 는 시간을 고르는 게 아니라
                        "이 날 예약이 되는지"를 보는 칸이라, "시간을 선택해주세요"가 말이 안 된다. */}
                    <Form.Item
                        label={reservationTimeLabel(store?.bookingType)}
                        name="reservationTime"
                        // 날짜를 고르기 전에는 이 칸에 넣을 값 자체가 없다(슬롯을 날짜로 조회한다).
                        // 그런데도 required 를 걸어두면 아무것도 안 채우고 제출했을 때 날짜와 시간이
                        // 동시에 빨개져서, 지금 고칠 수 없는 칸까지 고치라고 지시하게 된다.
                        // 실제로 고쳐야 할 곳은 바로 위 날짜 칸 하나이고 그 칸이 이미 막고 있다.
                        // (interactions.css 의 "비활성은 에러보다 우선한다"와 같은 규칙이다)
                        //
                        // ⚠️ dependencies={['reservationDate']} 를 붙이면 안 된다 — rc-field-form 은
                        //    의존 필드가 바뀌는 즉시 이 칸을 재검증해서, 날짜를 고르자마자 아직 아무것도
                        //    안 한 시간 칸에 "시간을 선택해주세요"가 튀어나온다(2026-07에 이미 한 번
                        //    고쳤던 회귀다 — TimeSlotPicker 의 setFields 주석 참고).
                        //    함수형 rule 은 검증 시점에 getFieldValue 로 최신 날짜를 직접 읽으므로
                        //    dependencies 없이도 제출 때 올바르게 평가된다.
                        rules={[({ getFieldValue }) => ({
                            required: !!getFieldValue('reservationDate'),
                            message: store?.bookingType === 'DAY' ? '날짜를 선택해주세요.' : '시간을 선택해주세요.',
                        }), ({ getFieldValue }) => ({
                            validator: (_, time) => {
                                const date = getFieldValue('reservationDate');
                                if (!date) return Promise.resolve();
                                const timeAvailability = timeAvailabilityRef.current;
                                const key = `${store?.id}:${date.format('YYYY-MM-DD')}`;
                                if (timeAvailability.key !== key || timeAvailability.status !== 'success') {
                                    return Promise.reject(new Error(timeAvailability.status === 'error' && timeAvailability.key === key
                                        ? '예약 가능한 시간을 다시 불러와 주세요.'
                                        : '예약 가능한 시간을 확인하는 중이에요. 잠시 후 다시 시도해 주세요.'));
                                }
                                if (time && !timeAvailability.slots.some(slot => slot.time === time && isSelectableSlot(slot, store?.id, date.format('YYYY-MM-DD'), editingReservation))) {
                                    return Promise.reject(new Error('예약 가능한 시간을 다시 선택해주세요.'));
                                }
                                return Promise.resolve();
                            },
                        })]}>
                        <TimeSlotPicker store={store} dateValue={dateValue} form={form} onAvailabilityChange={handleAvailabilityChange} editingReservation={editingReservation} />
                    </Form.Item>
                    <Form.Item label="인원 수" name="guestCount" rules={VALIDATION_RULES.guestCount}>
                        <GuestCountInput />
                    </Form.Item>
                    <Form.Item label="요청 사항" name="specialRequest">
                        <FormTextArea rows={3} placeholder="요청 사항을 입력하세요." />
                    </Form.Item>
                    <div style={{ marginTop: 24 }}>
                        <Button variant="primary" htmlType="submit" block loading={paying}>
                            {submitLabel}
                        </Button>
                    </div>
                </>
            )}
        </Form>
    </div>
    );
};

const pcFormStyles = {
    panel: {
        background: colors.background.paper,
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.light}`,
        padding: '28px 24px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    },
};

// "우리동네" 기준 위치 — 저장된 위치가 있으면 그것, 없으면 이 세션의 라이브 위치.
const resolveNearbyUserLocation = (user, liveLocation) => ((user?.latitude != null && user?.longitude != null)
    ? { latitude: user.latitude, longitude: user.longitude }
    : liveLocation);

const storeDocumentDescription = (store) => {
    if (!store) return undefined;
    const categoryPart = store.category ? store.category + ' ' : '';
    const addressPart = store.address ? store.address + '. ' : '';
    return `${store.name} 예약 | ${categoryPart}${addressPart}RESERVE에서 간편하게 예약하세요.`;
};

const StoreNotFound = ({ error, onRetry }) => (
    <DataState
        state={error ? 'error' : 'empty'}
        kind="store"
        subject="가게 정보"
        error={error}
        title={error ? undefined : '요청하신 가게를 찾을 수 없습니다.'}
        onRetry={error ? onRetry : undefined}
        style={{ marginTop: 100 }}
    />
);

// 상세 이미지 캐러셀 — PC·모바일이 래퍼/이미지 스타일만 다르고 구조는 같다.
const StoreImageCarousel = ({ storeName, sliderImages, autoplay, wrapperStyle, imageStyle }) => (
    <div style={{ position: 'relative' }}>
        <div className="reserve-store-gallery" style={wrapperStyle} onClickCapture={rememberStorePreviewOrigin}>
            <Image.PreviewGroup items={sliderImages.map(getDetailImageUrl)} classNames={storePreviewClassNames}><Carousel className="reserve-carousel" infinite
                /* 터치 스와이프를 명시적으로 켠다. react-slick 은 기본값이 켜져 있지만,
                   swipeToSlide 가 없으면 "슬라이드 폭의 일정 비율" 을 넘겨야만 넘어가서
                   짧게 쓸면 제자리로 돌아온다 — 모바일에서 "안 넘어간다" 의 원인.
                   touchThreshold 를 낮춰 감도도 올린다(기본 5는 둔하다). */
                draggable swipe touchMove swipeToSlide touchThreshold={12}
                dotPlacement="bottom" autoplay={autoplay}>
                {sliderImages.map((img, sliderIdx) => (
                    <div key={img}>
                        {/* draggable={false} — PC 마우스 드래그 스와이프용.
                            브라우저 기본 이미지 드래그가 slick 의 mousemove 를 가로채기 때문이다.
                            CSS 쪽(-webkit-user-drag)은 index.css 에 있고, 이 속성은 Firefox 용이다. */}
                        <Image src={getDetailImageUrl(img)} alt={`${storeName}-${sliderIdx}`}
                            width="100%" style={imageStyle} draggable={false}
                            preview={{ mask: '크게 보기' }} />
                    </div>
                ))}
            </Carousel></Image.PreviewGroup>
        </div>
    </div>
);

const StoreReviewSection = ({ sectionRef, isPC, ...reviewListProps }) => (
    <section ref={sectionRef}>
        <Title level={3} style={styles.sectionTitle}>리뷰</Title>
        <ReviewList {...reviewListProps} isPC={isPC} />
    </section>
);

const StoreDetailPCLayout = ({ sliderImages, identityProps, panelProps, reviewProps }) => {
    const { store } = identityProps;
    return (
        <>
            <div style={styles.pcGrid}>
                <div style={styles.pcLeft}>
                    <StoreImageCarousel storeName={store.name} sliderImages={sliderImages}
                        autoplay={store.imageAutoplayEnabled !== false}
                        wrapperStyle={styles.pcImageWrapper} imageStyle={styles.pcMainImg} />
                    <StoreIdentity {...identityProps} />
                    <StoreInfoSection store={store} />
                    <div style={{ marginTop: 20, marginBottom: 8 }}>
                        <KakaoMap latitude={store.latitude} longitude={store.longitude}
                            address={store.address} storeName={store.name} height={220} />
                    </div>
                </div>
                <div style={styles.pcRight}>
                    <ReservationPanel {...panelProps} isPC={true} />
                </div>
            </div>
            {/* 리뷰 섹션을 2단 레이아웃(pcGrid) 밖으로 분리(2026-07) — 예전엔 pcLeft 안에 있어서
                예약 폼의 sticky 범위(부모 행 pcGrid가 다 스크롤될 때까지 폼이 화면에 붙어있음)가
                리뷰 개수만큼 계속 늘어나, 리뷰가 많은 가게일수록 폼이 오래 "고정"된 채로 남아있었다.
                풀와이드 섹션으로 빼서 sticky 범위를 갤러리+정보+지도까지로 줄이고, 리뷰는 더 넓은
                폭(540→720)으로 보여준다. 폭은 취향껏 다시 조정 가능. */}
            <Divider style={styles.divider} />
            <StoreReviewSection {...reviewProps} isPC />
        </>
    );
};

const StoreDetailMobileLayout = ({ sliderImages, identityProps, panelProps, reviewProps }) => {
    const { store } = identityProps;
    return (
        <>
            <section style={{ padding: 0 }}>
                <StoreImageCarousel storeName={store.name} sliderImages={sliderImages}
                    autoplay={store.imageAutoplayEnabled !== false}
                    wrapperStyle={styles.mobileImageWrapper} imageStyle={styles.mainImg} />
                <div>
                    <StoreIdentity {...identityProps} />
                </div>
            </section>
            <div>
                <StoreInfoSection store={store} />
                <div style={{ marginTop: 16, marginBottom: 8 }}>
                    <KakaoMap latitude={store.latitude} longitude={store.longitude}
                        address={store.address} storeName={store.name} height={200} />
                </div>
            </div>
            <Divider style={styles.divider} />
            <section>
                <ReservationPanel {...panelProps} isPC={false} />
            </section>
            <Divider style={styles.divider} />
            <StoreReviewSection {...reviewProps} isPC={false} />
        </>
    );
};

const StoreDetail = () => {
    const { id } = useParams();
    // /store/abc 처럼 숫자가 아닌 id 는 API 에 보내지 않는다 — 보내면 400 이 와서
    // "요청을 처리할 수 없습니다 · 다시 불러오기" 라는, 다시 눌러도 낫지 않는 오류로 보였다.
    const validId = /^\d+$/.test(id ?? '') && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    const navigate = useNavigate();
    const { message } = useMessage();
    const { isLoggedIn, user } = useAuthStore();
    const { pay, paying } = usePayment();
    const { store, loading, error, refetch } = useStoreData(validId ? id : null);
    // 삭제·제재된 가게(404)도 "없는 가게"다. 일시 장애처럼 재시도를 권하지 않는다.
    const notFound = !validId || httpStatusOf(error) === 404;
    const imageHint = useStoreImageHint(id);

    // 상세 데이터가 도착하면 이 가게의 커버 이미지 비율도 적어둔다 (2026-07 추가).
    // 목록을 거치지 않고 상세 URL로 바로 들어온 경우엔 미리 알 방법이 없지만(그 한 번은 1:1 폴백),
    // 한 번 본 뒤에는 새로고침하거나 다시 들어와도 스켈레톤이 정확한 비율로 뜨도록.
    useEffect(() => {
        if (store) rememberImageHints(store);
    }, [store]);
    const [form] = Form.useForm();
    const windowWidth = useWindowWidth();
    const isPC = windowWidth >= BREAKPOINT;
    const openStoreMessenger = useMessengerStore((state) => state.openStore);

    const handleStoreContact = () => {
        const target = `/messages?storeId=${id}`;
        // 모바일은 브라우저 뒤로가기가 자연스러운 전체 페이지, 태블릿 이상은 현재 맥락을
        // 유지하는 오른쪽 패널을 쓴다. 비로그인은 PrivateRoute를 거쳐 로그인 뒤 돌아온다.
        if (!isLoggedIn || windowWidth < breakpoints.tablet) navigate(target);
        else openStoreMessenger(Number(id));
    };

    // "우리동네" 배지 — StoreCard/StoreList와 동일한 원칙 및 우선순위(2026-07 수정):
    // 마이페이지에 저장된 위치가 있으면 그게 최우선이고, 없을 때만 이 세션에서 얻은 라이브 위치로
    // 폴백한다. "우리동네"는 사용자가 사는/자주 가는 동네라는 안정적인 개념이라, 거리순 정렬을
    // 한 번 눌러서 라이브 위치 권한을 허용했다고 그 뒤로 계속 그 위치 기준으로 바뀌면 안 된다
    // (예: 마이페이지엔 청와대로 저장해뒀는데 안산에서 거리순 한 번 누르면 그 뒤로는 별점순으로
    // 바꿔도 안산 근처 가게만 "우리동네"로 뜨는 문제 — StoreList.jsx의 nearbyUserLocation 참고).
    const { liveLocation } = useLocationStore();
    const nearbyUserLocation = resolveNearbyUserLocation(user, liveLocation);

    const {
        completedReservation,
        reviewEligibilityError,
        reviewEligibilityLoading,
        refetchReviewEligibility,
        stateOpenWrite,
        stateOpenReviewId,
        reviewSectionRef,
        onFinish,
        isEditMode,
        editingReservation,
        editLoadError,
        editRetrying,
        retryEditLoad,
    } = useStoreDetailActions({ id, store, isLoggedIn, user, form, pay, message });

    useDocumentTitle(store?.name ?? null, storeDocumentDescription(store));

    // PC·모바일 뒤로가기는 데이터 로딩과 무관하게 공통 Header에서 제공한다.

    const containerSize = isPC ? 'xl' : 'md';
    const paddingTop = isPC ? '32px' : '20px';

    if (loading) return (
        <PageContainer size={containerSize} paddingTop={paddingTop} className="reserve-data-skeleton" aria-busy="true">
            <StoreDetailSkeleton imageHint={imageHint} isPC={isPC} />
        </PageContainer>
    );
    if (!store) return (
        <PageContainer size={containerSize} paddingTop={paddingTop}>
            <StoreNotFound error={notFound ? undefined : error} onRetry={refetch} />
        </PageContainer>
    );

    const sliderImages = store.detailImageUrls?.length > 0 ? store.detailImageUrls : [store.mainImageUrl];
    // ★ 2026-08-06 — 프리뷰에 "3 / 4" 처럼 실제보다 많은 장수가 뜨던 버그
    //   react-slick 은 infinite 루프를 위해 앞뒤 슬라이드를 **복제**한다(.slick-cloned).
    //   복제본도 진짜 <Image> 라서 Image.PreviewGroup 이 그것까지 수집한다 →
    //   사진 2장을 넣으면 프리뷰가 4장으로 잡히고, 넘겨도 같은 사진이 반복돼
    //   "스와이프가 안 먹는다"처럼 보인다.
    //   ★ 2026-08-06 2차 — 처음엔 infinite 를 껐다. 그랬더니 더 나쁜 증상이 생겼다:
    //   사진 2장 + autoplay 면 캐러셀이 **마지막 장에 멈춰** 있고, 그 상태에서 왼쪽으로
    //   쓸면(= 다음 장) 갈 곳이 없어 아무 일도 안 일어난다 → "스와이프가 안 된다"로 보인다.
    //   (실측: 오른쪽 쓸기는 1→0 으로 정상 동작했다. 즉 스와이프 자체는 멀쩡했다.)
    //   → infinite 는 되살리고, 장수 문제는 PreviewGroup 에 items 를 명시해서 푼다.
    //     items 를 주면 AntD 가 자식 <Image> 를 수집하지 않으므로 복제본이 섞이지 않는다.
    const nearby = isNearby(nearbyUserLocation, store.latitude, store.longitude, store.nearbyRadiusKm ?? undefined);
    const identityProps = { store, nearby, canContact: user?.id !== store.ownerId, onContact: handleStoreContact };
    const panelProps = {
        store, form, onFinish, paying, isEditMode, editingReservation,
        editLoadError, editRetrying, onRetryEditLoad: retryEditLoad,
    };
    const reviewProps = {
        sectionRef: reviewSectionRef,
        storeId: Number(id),
        completedReservation,
        completedReservationError: reviewEligibilityError,
        completedReservationRetrying: reviewEligibilityLoading,
        onCompletedReservationRetry: refetchReviewEligibility,
        autoOpenWrite: stateOpenWrite,
        focusReviewId: stateOpenReviewId,
    };

    return (
        <PageContainer className="reserve-store-detail" size={containerSize} paddingTop={paddingTop}>

            {isPC ? (
                <StoreDetailPCLayout sliderImages={sliderImages} identityProps={identityProps}
                    panelProps={panelProps} reviewProps={reviewProps} />
            ) : (
                <StoreDetailMobileLayout sliderImages={sliderImages} identityProps={identityProps}
                    panelProps={panelProps} reviewProps={reviewProps} />
            )}
        </PageContainer>
    );
};

const styles = {
    identityBadge:    { marginRight: 0, marginBottom: 0 },
    divider:          { margin: '24px 0' },
    sectionTitle:     { marginTop: 0, marginBottom: 20, fontWeight: fontWeight.bold },
    mainImg:          { width: '100%', height: 'auto', display: 'block' },
    pcGrid:           { display: 'flex', gap: 36, alignItems: 'flex-start' },
    pcLeft:           { flex: '0 0 50%', minWidth: 0, maxWidth: 560 },
    pcRight:          { flex: 1, minWidth: 320, maxWidth: 440, position: 'sticky', top: 80, alignSelf: 'flex-start' },
    pcImageWrapper:   { width: '100%', overflow: 'hidden', borderRadius: radius.xl, lineHeight: 0 }, 
    pcMainImg:        { width: '100%', height: 'auto', display: 'block' },
    mobileImageWrapper: { width: '100%', overflow: 'hidden', marginBottom: 0, lineHeight: 0, borderRadius: radius.xl }, 
    
};

export default StoreDetail;
