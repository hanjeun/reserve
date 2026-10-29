import LoadingStatus from '../../components/common/LoadingStatus';
import React from 'react';
import { Form } from 'antd';
import { PlusOutlined, MinusOutlined, ClockCircleOutlined } from '../../components/common/icons';
import { Button, DataState, FormTextArea, Bone } from '../../components/common';
import { BookingCalendar } from '../../components/store';
import StoreActionPanel from '../../components/store/StoreActionPanel';
import { formatTime } from '../../utils/date';
import { colors, radius, fontWeight, fontSize, heights, animation, field, transitions } from '../../styles/tokens';
import { VALIDATION_RULES } from '../../utils/validation';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import RollingFieldValue from '../../components/common/RollingFieldValue';
import ReservationEntryNotice from './ReservationEntryNotice';
import ReservationConsentField from './ReservationConsentField';
import reservationService from '../../services/reservationService';

const GuestCountInput = ({ id, value = 1, onChange, disabled = false, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, 'aria-invalid': invalid }) => {
    const dec = () => { if (value > 1) onChange?.(value - 1); };
    const inc = () => { if (value < 99) onChange?.(value + 1); };
    return (
        <div id={id} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid} style={inputStyles.wrapper}>
            <span style={inputStyles.count}><RollingFieldValue value={value}>{`${value}명`}</RollingFieldValue></span>
            <div style={inputStyles.btnGroup}>
                <button type="button" className="rsv-tap-btn reserve-guest-count-step" aria-label="인원 줄이기" onClick={dec} disabled={disabled || value <= 1} style={{ ...inputStyles.btn, opacity: value <= 1 ? 0.35 : undefined }}>
                    <MinusOutlined style={{ fontSize: 12 }} />
                </button>
                <button type="button" className="rsv-tap-btn reserve-guest-count-step" aria-label="인원 늘리기" onClick={inc} disabled={disabled || value >= 99} style={{ ...inputStyles.btn, opacity: value >= 99 ? 0.35 : undefined }}>
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
    // 표시 상태와 제출 검증은 같은 시간 조회 상태를 사용한다.
    const commitAvailability = React.useCallback(next => {
        onAvailabilityChange?.(next);
        setAvailability({ ...next, request });
    }, [onAvailabilityChange, request]);

    React.useEffect(() => {
        if (!requestKey) return;
        let cancelled = false;
        const controller = new AbortController();
        // 로딩은 요청 키로 판별하고 외부 폼 검증기에만 변경을 알린다.
        onAvailabilityChange?.({ key: requestKey, status: 'loading', slots: [] });
        const lookup = editingReservation?.id != null
            ? reservationService.getEditAvailability(editingReservation.id, storeId, dateKey, { signal: controller.signal })
            : api.get(API_ENDPOINTS.RESERVATION.AVAILABILITY, { params: { storeId, date: dateKey }, signal: controller.signal });
        lookup
            .then((data) => {
                if (cancelled) return;
                if (!Array.isArray(data)) throw new Error('Invalid availability results');
                // 수정 초기값은 조회 성공 뒤에도 서버가 허용한 시간일 때만 유지한다.
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

    // 날짜가 바뀌면 이전 시간 선택을 초기화한다.

    // 빈 선택은 폼에서 값 삭제로 처리할 수 있도록 전달한다.

    // 서로 다른 날짜로 바뀔 때만 선택 시간을 초기화한다.
    // 첫 날짜 선택·수정 초기값 주입에서는 시간 값을 유지한다.

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

export const TimeSlotPicker = props => <div id={props.id} role="group" aria-labelledby={props['aria-labelledby']}
    aria-describedby={props['aria-describedby']} aria-invalid={props['aria-invalid']}><TimeSlotPickerContent {...props} /></div>;

const TimeSlotPickerContent = ({ store, dateValue, value, onChange, form, onAvailabilityChange, editingReservation }) => {
    const { dateKey, storeId, loading, slots, failed, retry } = useTimeSlotAvailability({
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
    <LoadingStatus aria-label="예약 가능한 시간을 불러오는 중" aria-busy="true">
        <div style={timeSlotStyles.grid} aria-hidden="true">
            {[1, 2, 3, 4].map(key => <Bone key={key} pageLoading={false} height={38} borderRadius={radius.md} />)}
        </div>
    </LoadingStatus>
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
                color: isError ? colors.error.main : colors.text.placeholder,
            }} />
        </div>
    );
};

const TimePlaceholder = props => <Form.Item noStyle><TimePlaceholderField {...props} /></Form.Item>;

const timeSlotStyles = {
    placeholder: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: heights.input, padding: '0 11px', boxSizing: 'border-box',
        // 색을 하드코딩하지 말 것 — 여기 rgba(0,0,0,0.25)가 박혀 있어서 다크모드에서
        //   배경만 어두워지고 글자는 검은색 그대로라 "날짜를 먼저 선택해주세요"가 안 보였다.
        //   colors.*는 var(--c-...) 문자열이라 브라우저가 페인트 시점에 테마별로 해석한다.
        //   colors.text.placeholder는 AntD의 colorTextPlaceholder와 같은 값이라
        //   바로 옆 BookingCalendar의 "날짜 선택"과 톤이 정확히 일치한다.
        ...field.textStyle, color: field.placeholderColor,
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
    reservationEntry = null,
    editLoadError = null, editRetrying = false, onRetryEditLoad, preview = false, bookingSectionRef,
}) => {
    const labelPrefix = React.useId();
    const dateValue = Form.useWatch('reservationDate', form);
    const timeValue = Form.useWatch('reservationTime', form);
    const entry = reservationEntry?.slot === `${store?.id}:${dateValue?.format('YYYY-MM-DD')}:${formatTime(timeValue)}` ? reservationEntry : null;
    const reservationStore = React.useMemo(() => preview ? { ...store, id: undefined } : store, [preview, store]);
    const timeAvailabilityRef = React.useRef({ key: /** @type {string | null} */ (null), status: 'idle', slots: [] });
    // DAY 자동 입력과 조회 완료가 같은 효과 배치에 있어 완료 상태를 검증에 즉시 반영한다.

    const handleAvailabilityChange = React.useCallback(next => { timeAvailabilityRef.current = next; }, []);
    let submitLabel = isEditMode ? '예약 변경하기' : '예약 신청하기';
    if (paying) submitLabel = '처리 중...';
    return (
    <StoreActionPanel sectionRef={bookingSectionRef} title={isEditMode ? '예약 변경하기' : '예약하기'} isPC={isPC}>
        <Form form={form} component={preview ? false : 'form'} layout="vertical" onFinish={preview ? undefined : onFinish}
            initialValues={{ guestCount: 1 }} requiredMark={false}
            style={{ fontWeight: fontWeight.medium }}>
            {/* 수정할 예약을 못 불러왔으면 빈 폼을 보여 주지 않는다. 채워지지 않은 폼에서 "변경하기"를
                누르면 새 예약을 만드는 것처럼 보인다. 재시도 뒤 prefill 이 붙도록 Form 요소는 남긴다. */}
            {isEditMode && editLoadError ? (
                <DataState state="error" kind="reservation" subject="변경할 예약 정보" error={editLoadError}
                    title="변경할 예약 정보를 불러오지 못했어요." onRetry={onRetryEditLoad} retrying={editRetrying} />
            ) : (
                <>
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
                    <Form.Item htmlFor={null} label={<span id={`${labelPrefix}-guests`}>인원 수</span>} name="guestCount" rules={VALIDATION_RULES.guestCount}>
                        <GuestCountInput aria-labelledby={`${labelPrefix}-guests`} disabled={preview} />
                    </Form.Item>
                    <Form.Item label="요청 사항" name="specialRequest">
                        <FormTextArea rows={3} placeholder="요청 사항을 입력하세요." disabled={preview} />
                    </Form.Item>
                    {!isEditMode && <ReservationConsentField storeId={store?.id} disabled={preview} />}
                    <div style={{ marginTop: 24 }}>
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
