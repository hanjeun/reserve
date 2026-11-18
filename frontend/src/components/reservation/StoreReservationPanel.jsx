import LoadingStatus from '../../components/common/LoadingStatus';
import React from 'react';
import { Form } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BookingOpeningNotice from './BookingOpeningNotice';
import { PlusOutlined, MinusOutlined, ClockCircleOutlined } from '../../components/common/icons';
import { Button, DataState, FormTextArea, Bone } from '../../components/common';
import { BookingCalendar } from '../../components/store';
import StoreActionPanel from '../../components/store/StoreActionPanel';
import { formatTime } from '../../utils/date';
import { colors, radius, fontWeight, fontSize, animation, field, transitions } from '../../styles/tokens';
import { MAX_RESERVATION_GUESTS, MAX_RESERVATION_REQUEST_LENGTH, VALIDATION_RULES } from '../../utils/validation';
import { reservationKeys } from '../../hooks/queryKeys';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import RollingFieldValue from '../../components/common/RollingFieldValue';
import ReservationEntryNotice from './ReservationEntryNotice';
import ReservationConsentField from './ReservationConsentField';
import reservationService from '../../services/reservationService';

const GuestCountInput = ({ id, value = 1, max, onChange, disabled = false, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, 'aria-invalid': invalid }) => {
    const dec = () => { if (value > 1) onChange?.(value - 1); };
    const atLimit = value >= max;
    const inc = () => { if (!atLimit) onChange?.(value + 1); };
    return (
        <div id={id} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid} style={inputStyles.wrapper}>
            <span style={inputStyles.count}><RollingFieldValue value={value}>{`${value}명`}</RollingFieldValue></span>
            <div style={inputStyles.btnGroup}>
                <button type="button" className="rsv-tap-btn reserve-guest-count-step" aria-label="인원 줄이기" onClick={dec} disabled={disabled || value <= 1} style={{ ...inputStyles.btn, opacity: value <= 1 ? 0.35 : undefined }}>
                    <MinusOutlined style={{ fontSize: 12 }} />
                </button>
                <button type="button" className="rsv-tap-btn reserve-guest-count-step" aria-label="인원 늘리기" onClick={inc} disabled={disabled || atLimit} style={{ ...inputStyles.btn, opacity: atLimit ? 0.35 : undefined }}>
                    <PlusOutlined style={{ fontSize: 12 }} />
                </button>
            </div>
        </div>
    );
};

const inputStyles = {
    wrapper: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: field.bg, borderRadius: field.radius,
        paddingInline: field.paddingInline, height: field.height, border: 'none',
    },
    count: { ...field.textStyle, color: colors.text.primary, fontWeight: fontWeight.medium },
    btnGroup: { display: 'flex', gap: 8 },
    btn: {
        width: 32, height: 32, borderRadius: radius.md,
        background: colors.gray[100], border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: colors.text.secondary, transition: `all ${transitions.fast} ${transitions.easing}`,
    },
};

const isExistingReservationSlot = (slot, storeId, dateKey, editingReservation) => Boolean(
    editingReservation?.id != null
    && String(editingReservation.storeId) === String(storeId)
    && editingReservation.reservationDate === dateKey
    && formatTime(editingReservation.reservationTime) === slot.time
);
const isSelectableSlot = (slot, storeId, dateKey, editingReservation) =>
    slot.available === true || (slot.remainingCapacity === undefined && isExistingReservationSlot(slot, storeId, dateKey, editingReservation));

const guestLimit = (store, slot) => {
    const storeLimit = store?.maxCapacityPerSlot > 0 ? store.maxCapacityPerSlot : MAX_RESERVATION_GUESTS;
    return Math.min(MAX_RESERVATION_GUESTS, storeLimit, slot?.remainingCapacity ?? MAX_RESERVATION_GUESTS);
};

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

const EMPTY_SLOTS = [];
const SLOT_EXIT_MS = 160;

const useTimeSlotAvailability = ({ store, dateValue, form, onAvailabilityChange, editingReservation }) => {
    const dateKey = dateValue?.format('YYYY-MM-DD');
    const storeId = store?.id;
    const reservationId = editingReservation?.id;
    const requestKey = dateKey && storeId ? `${storeId}:${dateKey}` : null;
    const { data, error, fetchStatus, refetch } = useQuery({
        queryKey: reservationKeys.availability(storeId, dateKey, reservationId),
        enabled: Boolean(requestKey),
        retry: false,
        staleTime: 0,
        queryFn: async ({ signal }) => {
            const slots = reservationId != null
                ? await reservationService.getEditAvailability(reservationId, storeId, dateKey, { signal })
                : await api.get(API_ENDPOINTS.RESERVATION.AVAILABILITY, { params: { storeId, date: dateKey }, signal });
            if (!Array.isArray(slots)) throw new Error('Invalid availability results');
            return slots;
        },
    });
    const status = !requestKey ? 'idle' : error ? 'error' : fetchStatus !== 'idle' || !data ? 'loading' : 'success';
    const slots = requestKey && !error ? data ?? EMPTY_SLOTS : EMPTY_SLOTS;
    const availability = React.useMemo(() => ({ key: requestKey, status, slots }), [requestKey, status, slots]);

    const previousDate = React.useRef(null);
    React.useEffect(() => {
        const before = previousDate.current;
        previousDate.current = dateKey;
        if (before != null && before !== dateKey) {
            form?.setFields([{ name: 'reservationTime', value: undefined, errors: [] }]);
        }
    }, [dateKey, form]);

    React.useEffect(() => {
        onAvailabilityChange?.(availability);
        if (status === 'success') clearUnofferedTime(form, slots, storeId, dateKey, editingReservation);
        if (status === 'error') form?.setFields([{ name: 'reservationTime', value: undefined, errors: [] }]);
    }, [availability, onAvailabilityChange, status, slots, form, storeId, dateKey, editingReservation]);

    // 갱신 중에는 기존 시간을 유지해 마감된 칸만 퇴장할 수 있게 한다.
    return { dateKey, storeId, slots, loading: status === 'loading' && !data, failed: status === 'error', error, retry: () => refetch() };
};

export const TimeSlotPicker = props => <div id={props.id} role="group" aria-labelledby={props['aria-labelledby']}
    aria-describedby={props['aria-describedby']} aria-invalid={props['aria-invalid']}><TimeSlotPickerContent {...props} /></div>;

const TimeSlotPickerContent = ({ store, dateValue, value, onChange, form, onAvailabilityChange, editingReservation }) => {
    const { dateKey, storeId, loading, slots, failed, error, retry } = useTimeSlotAvailability({
        store, dateValue, form, onAvailabilityChange, editingReservation,
    });

    // 날짜 단위 예약

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
            error={error} onRetry={retry} compact />;
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

    return <div>
        {existingSelection && <ExistingTimeNotice />}
        <TimeSlotChoices key={dateKey} slots={slots} value={value} onChange={onChange}
            storeId={storeId} dateKey={dateKey} editingReservation={editingReservation} />
    </div>;
};

const TimeSlotLoading = () => (
    <LoadingStatus aria-label="예약 가능한 시간을 불러오는 중" aria-busy="true">
        <div style={timeSlotStyles.grid} aria-hidden="true">
            {[1, 2, 3, 4].map(key => <Bone key={key} pageLoading={false} height={38} borderRadius={radius.md} />)}
        </div>
    </LoadingStatus>
);

const TimeSlotChoices = ({ slots, value, onChange, storeId, dateKey, editingReservation }) => {
    const reducedMotion = useReducedMotion();
    const selectable = slot => isSelectableSlot(slot, storeId, dateKey, editingReservation);
    const hasChoice = slots.some(selectable);
    const { shouldRender } = useExitAnimation(hasChoice, SLOT_EXIT_MS, !reducedMotion);
    if (!hasChoice && (reducedMotion || !shouldRender)) return <TimePlaceholder text="이 날은 예약이 마감됐어요" />;

    const groups = [
        { label: '오전', slots: slots.filter(slot => slot.time < '12:00') },
        { label: '오후', slots: slots.filter(slot => slot.time >= '12:00') },
    ];
    return <div>
        {groups.map(({ label, slots: group }) => group.length > 0 && (
            <div key={label} className="reserve-time-slot-group">
                <div style={timeSlotStyles.groupLabel}>{label}</div>
                <div style={timeSlotStyles.grid}>
                    {group.map((slot, index) => <TimeSlotPill key={slot.time} time={slot.time} selected={value === slot.time}
                        selectable={selectable(slot)} reducedMotion={reducedMotion} delay={index * 40}
                        onClick={() => onChange?.(slot.time)} />)}
                </div>
            </div>
        ))}
    </div>;
};

const TimeSlotPill = ({ time, selected, selectable, onClick, reducedMotion, delay }) => {
    const { shouldRender } = useExitAnimation(selectable, SLOT_EXIT_MS, !reducedMotion);
    if (!selectable && (reducedMotion || !shouldRender)) return null;

    return <button type="button"
        className={`rsv-tap-btn rsv-time-pill${selected && selectable ? ' rsv-selected' : ''}`}
        disabled={!selectable} aria-hidden={!selectable || undefined} aria-pressed={selectable && selected} onClick={onClick}
        style={{
            ...timeSlotStyles.pill,
            animation: reducedMotion ? 'none' : selectable ? animation.scaleSpringIn : `reserve-time-slot-exit ${SLOT_EXIT_MS}ms ease-in both`,
            animationDelay: selectable ? `${delay}ms` : undefined,
        }}>
        {time}
    </button>;
};

/*
 * 기본 Picker가 아닌 표면은 Form.Item.useStatus로 필드 검증 상태를 반영한다.
 */
const TimePlaceholderField = ({ text }) => {
    const { status } = Form.Item.useStatus();
    const isError = status === 'error';
    // 날짜 필드와 같은 오류 테두리·아이콘 규칙을 사용한다.

    return (
        <div style={{
            ...timeSlotStyles.placeholder,
            ...(isError ? { boxShadow: field.errorRing } : null),
        }}>
            <span>{text}</span>
            <ClockCircleOutlined style={{
                ...timeSlotStyles.placeholderIcon,
                color: isError ? colors.error.main : field.selectionHintColor,
            }} />
        </div>
    );
};

const TimePlaceholder = props => <Form.Item noStyle><TimePlaceholderField {...props} /></Form.Item>;

const timeSlotStyles = {
    placeholder: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: field.height, paddingInline: field.paddingInline, boxSizing: 'border-box',
        ...field.textStyle, color: field.selectionHintColor,
        background: field.bg, borderRadius: field.radius,
        transition: 'box-shadow 0.2s',
    },
    placeholderIcon: { fontSize: field.iconSize, color: field.selectionHintColor },
    groupLabel: { fontSize: fontSize.sm, color: colors.text.tertiary, fontWeight: fontWeight.medium, marginBottom: 8 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
    pill: {
        padding: '9px 0', borderRadius: radius.md, border: 'none',
        fontSize: fontSize.sm, fontWeight: fontWeight.medium, cursor: 'pointer',
    },
};

export const ReservationPanel = ({
    store, form, onFinish, paying, isPC, isEditMode, editingReservation,
    reservationEntry = null,
    editLoadError = null, editRetrying = false, onRetryEditLoad, preview = false, bookingSectionRef, openingObservedAt,
}) => {
    const labelPrefix = React.useId();
    const queryClient = useQueryClient();
    const storeId = store?.id;
    const refreshOpening = React.useCallback(() => {
        if (preview || !storeId) return;
        void queryClient.invalidateQueries({ queryKey: reservationKeys.availability(storeId).slice(0, 3) });
        void queryClient.invalidateQueries({ queryKey: reservationKeys.calendar(storeId).slice(0, 3) });
    }, [queryClient, preview, storeId]);
    const dateValue = Form.useWatch('reservationDate', form);
    const timeValue = Form.useWatch('reservationTime', form);
    const entry = reservationEntry?.slot === `${store?.id}:${dateValue?.format('YYYY-MM-DD')}:${formatTime(timeValue)}` ? reservationEntry : null;
    const reservationStore = React.useMemo(() => preview ? { ...store, id: undefined } : store, [preview, store]);
    const [timeAvailability, setTimeAvailability] = React.useState({ key: null, status: 'idle', slots: EMPTY_SLOTS });
    const timeAvailabilityRef = React.useRef(timeAvailability);
    const dateKey = dateValue?.format('YYYY-MM-DD');
    const selectedSlot = timeAvailability.key === `${store?.id}:${dateKey}`
        ? timeAvailability.slots.find(slot => slot.time === timeValue && isSelectableSlot(slot, store?.id, dateKey, editingReservation)) : undefined;
    const maxGuests = guestLimit(store, selectedSlot);
    const guestLimitText = `최대 ${maxGuests}명까지 예약할 수 있어요.`;
    // 날짜 단위 예약의 자동 선택 전에 제출 검증도 새 조회 결과를 읽는다.
    const handleAvailabilityChange = React.useCallback(next => {
        timeAvailabilityRef.current = next;
        setTimeAvailability(next);
    }, []);
    let submitLabel = isEditMode ? '예약 변경하기' : '예약 신청하기';
    if (paying) submitLabel = '처리 중...';
    const FieldsContainer = isPC ? 'div' : React.Fragment;
    return (
    <StoreActionPanel sectionRef={bookingSectionRef} title={isEditMode ? '예약 변경하기' : '예약하기'} isPC={isPC}
        className={isPC ? 'reserve-booking-panel--desktop' : undefined}>
        <Form form={form} component={preview ? false : 'form'} layout="vertical" onFinish={preview ? undefined : onFinish}
            initialValues={{ guestCount: 1 }} requiredMark={false}
            className={isPC ? 'reserve-booking-panel-form' : undefined} scrollToFirstError={isPC ? { block: 'nearest', focus: true } : undefined}
            style={{ fontWeight: fontWeight.medium }}>
            {/* 수정할 예약을 못 불러왔으면 빈 폼을 보여 주지 않는다. 채워지지 않은 폼에서 "변경하기"를
                누르면 새 예약을 만드는 것처럼 보인다. 재시도 뒤 prefill 이 붙도록 Form 요소는 남긴다. */}
            {isEditMode && editLoadError ? (
                <DataState state="error" kind="reservation" subject="변경할 예약 정보" error={editLoadError}
                    title="변경할 예약 정보를 불러오지 못했어요." onRetry={onRetryEditLoad} retrying={editRetrying} />
            ) : (
                <>
                    <FieldsContainer {...(isPC ? { className: 'reserve-booking-panel-fields', role: 'region', 'aria-label': '예약 입력 영역', tabIndex: 0 } : {})}>
                    {store?.bookingOpening && <BookingOpeningNotice opening={store.bookingOpening} observedAt={openingObservedAt} onOpen={refreshOpening} />}
                    <Form.Item label="예약 날짜" name="reservationDate"
                        rules={[{ required: true, message: '날짜를 선택해주세요.' }]}>
                        {/*
                         * 예약 가능 여부·불가 사유는 서버 달력 응답을 표시하고 프론트에서 재판정하지 않는다.
                         */}
                        <BookingCalendar storeId={reservationStore?.id} reservationId={editingReservation?.id} disabled={preview} />
                    </Form.Item>
                    {/* 라벨·에러 문구가 예약 방식을 따라간다. DAY 는 시간을 고르는 게 아니라
                        "이 날 예약이 되는지"를 보는 칸이라, "시간을 선택해주세요"가 말이 안 된다. */}
                    <Form.Item
                        htmlFor={null} label={<span id={`${labelPrefix}-time`}>{reservationTimeLabel(store?.bookingType)}</span>}
                        name="reservationTime"
                        // 시간 필수 검증은 날짜를 고른 경우에만 적용한다.

                        // 의존 필드의 즉시 재검증 대신 제출 시 최신 날짜를 읽는다.

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
                        <TimeSlotPicker aria-labelledby={`${labelPrefix}-time`} store={reservationStore} dateValue={dateValue} form={form} onAvailabilityChange={handleAvailabilityChange} editingReservation={editingReservation} />
                    </Form.Item>
                    <Form.Item htmlFor={null} label={<span id={`${labelPrefix}-guests`}>인원 수</span>} name="guestCount"
                        extra={!preview && maxGuests < MAX_RESERVATION_GUESTS ? guestLimitText : undefined}
                        rules={[...VALIDATION_RULES.guestCount, ({ getFieldValue }) => ({
                            validator: (_, guests) => {
                                const date = getFieldValue('reservationDate')?.format('YYYY-MM-DD');
                                const time = getFieldValue('reservationTime');
                                const current = timeAvailabilityRef.current;
                                const slot = current.key === `${store?.id}:${date}` && current.slots.find(item => item.time === time);
                                const limit = guestLimit(store, slot);
                                return guests > limit ? Promise.reject(new Error(`최대 ${limit}명까지 예약할 수 있어요.`)) : Promise.resolve();
                            },
                        })]}>
                        <GuestCountInput aria-labelledby={`${labelPrefix}-guests`} max={maxGuests} disabled={preview} />
                    </Form.Item>
                    <Form.Item className="reserve-booking-request" label="요청 사항" name="specialRequest"
                        rules={VALIDATION_RULES.specialRequest.map(rule => ({
                            ...rule, transform: value => value === editingReservation?.specialRequest ? undefined : value,
                        }))}>
                        <FormTextArea rows={3} placeholder="요청 사항을 입력하세요." maxLength={MAX_RESERVATION_REQUEST_LENGTH} disabled={preview} />
                    </Form.Item>
                    {!isEditMode && <ReservationConsentField storeId={store?.id} disabled={preview} />}
                    </FieldsContainer>
                    <div className={isPC ? 'reserve-booking-panel-submit' : undefined} style={{ marginTop: isPC ? 0 : 24 }}>
                        {entry && <ReservationEntryNotice expiresAt={entry.expiresAt} />}
                        <Button variant="primary" htmlType={preview ? 'button' : 'submit'} block loading={paying} disabled={preview}>
                            {submitLabel}
                        </Button>
                    </div>
                </>
            )}
        </Form>
    </StoreActionPanel>
    );
};

// "우리동네" 기준 위치 — 저장된 위치가 있으면 그것, 없으면 이 세션의 라이브 위치.
