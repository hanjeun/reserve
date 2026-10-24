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

const GuestCountInput = ({ value = 1, onChange, disabled = false }) => {
    const dec = () => { if (value > 1) onChange?.(value - 1); };
    const inc = () => { if (value < 99) onChange?.(value + 1); };
    return (
        <div style={inputStyles.wrapper}>
            <span style={inputStyles.count}><RollingFieldValue value={value}>{`${value}명`}</RollingFieldValue></span>
            <div style={inputStyles.btnGroup}>
                <button type="button" className="rsv-tap-btn reserve-guest-count-step" onClick={dec} disabled={disabled || value <= 1} style={{ ...inputStyles.btn, opacity: value <= 1 ? 0.35 : undefined }}>
                    <MinusOutlined style={{ fontSize: 12 }} />
                </button>
                <button type="button" className="rsv-tap-btn reserve-guest-count-step" onClick={inc} disabled={disabled || value >= 99} style={{ ...inputStyles.btn, opacity: value >= 99 ? 0.35 : undefined }}>
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

    // 예약 방식 DAY (2026-08-24)
    // 서버가 슬롯을 딱 하나 내려준다("하루 = 슬롯 한 개"). 고를 게 없으므로 자동으로 채우고
    // 그리드 대신 안내 한 줄만 보여준다.
    //
    // 시간 칸을 아예 없애지 않는 이유 — 서버는 여전히 reservationTime 을 필수로 받는다.
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

/**
 * 시간 선택 자리표시자.
 *
 * 2026-08-06 — 왜 컴포넌트로 뺐나
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
    editLoadError = null, editRetrying = false, onRetryEditLoad, preview = false,
}) => {
    const dateValue = Form.useWatch('reservationDate', form);
    const reservationStore = React.useMemo(() => preview ? { ...store, id: undefined } : store, [preview, store]);
    const timeAvailabilityRef = React.useRef({ key: /** @type {string | null} */ (null), status: 'idle', slots: [] });
    // DAY auto-fill runs in the same effect batch as lookup completion. Validation must see that
    // completion immediately, rather than the previous render's pending state.
    const handleAvailabilityChange = React.useCallback(next => { timeAvailabilityRef.current = next; }, []);
    let submitLabel = isEditMode ? '예약 변경하기' : '예약 신청하기';
    if (paying) submitLabel = '처리 중...';
    return (
    <StoreActionPanel title={isEditMode ? '예약 변경하기' : '예약하기'} isPC={isPC}>
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
                        {/* 2026-08-25 — AntD DatePicker 팝업에서 인라인 BookingCalendar 로 교체.
                            예전에는 disabledDate 로 막았는데 그건 **회색밖에 못 칠한다** — 정기휴무,
                            임시휴무, 운영기간 밖, 예약범위 초과, 정원 마감이 전부 같은 회색이라
                            "왜 안 눌리지"를 알 방법이 없었다. 게다가 그 다섯 판정이 서버(isBookableOn)와
                            **프론트에도 따로**(makeDisabledDate) 있어서 언젠가 어긋날 자리였다.
                            이제 사유는 서버가 내려주고 달력은 그리기만 한다. */}
                        <BookingCalendar storeId={reservationStore?.id} disabled={preview} />
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
                        // 주의: dependencies={['reservationDate']} 를 붙이면 안 된다 — rc-field-form 은
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
                        <TimeSlotPicker store={reservationStore} dateValue={dateValue} form={form} onAvailabilityChange={handleAvailabilityChange} editingReservation={editingReservation} />
                    </Form.Item>
                    <Form.Item label="인원 수" name="guestCount" rules={VALIDATION_RULES.guestCount}>
                        <GuestCountInput disabled={preview} />
                    </Form.Item>
                    <Form.Item label="요청 사항" name="specialRequest">
                        <FormTextArea rows={3} placeholder="요청 사항을 입력하세요." disabled={preview} />
                    </Form.Item>
                    <div style={{ marginTop: 24 }}>
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
