import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { Image, Typography, Form, Carousel, Divider } from 'antd';
import {
    PlusOutlined, MinusOutlined, ArrowLeftOutlined,
    ClockCircleOutlined, CreditCardOutlined, FieldTimeOutlined,
    ThunderboltOutlined, RollbackOutlined, HourglassOutlined, TeamOutlined,
    FileTextOutlined, StarFilled, EnvironmentOutlined,
} from '@ant-design/icons';
import { PageContainer, Button, FormTextArea, FavoriteButton, Badge, KakaoMap, StoreDetailSkeleton } from '../../components/common';
import { BookingCalendar } from '../../components/store';
import { ReviewList } from '../../components/review';
import { useStoreData, useMessage, usePayment, useWindowWidth, useStoreDetailActions, useStoreImageHint } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { rememberImageHints } from '../../utils/imageHintCache';
import { getDetailImageUrl } from '../../utils';
import { isNearby } from '../../utils/distance';
import useLocationStore from '../../store/useLocationStore';
import { colors, radius, fontWeight, fontSize, heights, animation, field } from '../../styles/tokens';
import { VALIDATION_RULES } from '../../utils/validation';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';

const { Title, Text } = Typography;

const BREAKPOINT = 900;

const customStyles = `
  .ant-picker-cell::before, .ant-picker-cell-inner::before { display: none !important; }
  .ant-picker-cell .ant-picker-cell-inner {
    width: 32px !important; height: 32px !important; border-radius: 8px !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
  }
  /* 2026-08-06 - Carousel 전역 규칙은 여기서 걷어내 index.css 의 .reserve-carousel 로 옮겼다.
     이 style 블록은 컴포넌트 마운트 시 head 맨 뒤에 붙어 index.css 를 항상 덮는다.
     그래서 index.css 에 점·화살표 규칙을 넣어도 이 화면에서만 반영되지 않았고,
     모바일 화살표 숨김(display:none)도 여기 있던 display: flex !important 에 밀렸다.
     CLAUDE.md 의 "전역 CSS 는 index.css 에" 가 정확히 이 사고를 막으려는 규칙이다.
     주의: 이 문자열은 template literal 이라 주석 안에서도 백틱을 쓸 수 없다. */

  /* 원본 비율을 유지하도록 두 번째 코드의 height: 100%와 object-fit 제거 */
  .ant-image { width: 100% !important; }
  .ant-image-img { width: 100% !important; height: auto !important; display: block !important; }
  
  .slick-slide[aria-hidden="true"] * { pointer-events: none; }
  .rsv-tap-btn {
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }
  .rsv-tap-btn:focus {
    outline: none;
  }
  .rsv-tap-btn:focus-visible {
    box-shadow: 0 0 0 2px ${colors.primary.light};
  }
  .rsv-time-pill {
    background: transparent;
    color: ${colors.text.secondary};
    transition: background-color 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s ease;
  }
  .rsv-time-pill:hover:not(:disabled) {
    background-color: ${colors.gray[100]};
    color: ${colors.text.primary};
  }
  .rsv-time-pill.rsv-selected {
    background-color: ${colors.gray[200]};
    color: ${colors.text.primary};
    font-weight: 600;
    transform: scale(1.04);
  }
  .rsv-time-pill:disabled {
    color: ${colors.text.disabled};
    cursor: not-allowed;
    text-decoration: line-through;
  }
`;

// 인원 수 입력 스텝퍼
const GuestCountInput = ({ value = 1, onChange }) => {
    const dec = () => { if (value > 1) onChange?.(value - 1); };
    const inc = () => { if (value < 99) onChange?.(value + 1); };
    return (
        <div style={inputStyles.wrapper}>
            <span style={inputStyles.count}>{value}명</span>
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
                style={{ color: colors.text.secondary, textDecoration: 'none', borderBottom: `1px solid ${colors.border.light}` }}
                onMouseEnter={e => e.target.style.color = colors.primary.main}
                onMouseLeave={e => e.target.style.color = colors.text.secondary}>
                {row.value}
            </a>
        );
    }
    return row.value;
};

// 가게 상세 정보 섹션 — Cognitive Complexity: 30 → ~5
const StoreInfoSection = ({ store, description }) => {
    const rows = [
        buildAddressRow(store),
        buildHoursRow(store),
        buildDepositRow(store),
        buildRefundRow(store),
        buildDeadlineRow(store),
        buildPaymentTimeoutRow(store),
        buildSlotRow(store),
        buildCapacityRow(store),
    ].filter(Boolean);

    if (rows.length === 0 && !description) return null;

    return (
        <div style={infoStyles.card}>
            {description && (
                <>
                    <div style={infoStyles.row}>
                        <FileTextOutlined style={infoStyles.icon} />
                        <span style={infoStyles.label}>소개</span>
                        <div style={infoStyles.value}>{description}</div>
                    </div>
                    {rows.length > 0 && <div style={infoStyles.divider} />}
                </>
            )}
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
    label: { fontSize: fontSize.sm, color: colors.text.tertiary, flexShrink: 0, width: 90, lineHeight: '22px' },
    value: { fontSize: fontSize.sm, color: colors.text.secondary, flex: 1, lineHeight: '22px' },
    highlight: { color: colors.primary.main, fontWeight: fontWeight.medium },
    divider: { height: 1, background: colors.border.light },
};

// 예약 시간 선택 — 날짜 선택 시 GET /api/reservations/availability 조회해서 슬롯별 실시간 잔여 인원을 반영한 필 그리드로 보여준다.
// AntD FormTimePicker(시/분 스크롤 휠) 대신 네이버 예약 스타일의 pill 그리드 + scaleSpringIn 토큰으로 대체.
const TimeSlotPicker = ({ store, dateValue, value, onChange, form }) => {
    const [slots, setSlots] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const dateKey = dateValue ? dateValue.format('YYYY-MM-DD') : null;

    React.useEffect(() => {
        if (!dateKey || !store?.id) { setSlots([]); return; }
        let cancelled = false;
        setLoading(true);
        api.get(API_ENDPOINTS.RESERVATION.AVAILABILITY, { params: { storeId: store.id, date: dateKey } })
            .then((data) => { if (!cancelled) setSlots(data || []); })
            .catch(() => { if (!cancelled) setSlots([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [dateKey, store?.id]);

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
        if (!onlySlot || value === onlySlot.time) return;
        onChange?.(onlySlot.time);
    }, [onlySlot, value, onChange]);

    if (!dateKey) {
        return (
            <TimePlaceholder text={isDayBooking ? '날짜를 선택해주세요' : '날짜를 먼저 선택해주세요'} />
        );
    }
    if (loading) {
        return (
            <TimePlaceholder text="불러오는 중..." />
        );
    }
    if (slots.length === 0) {
        return (
            <TimePlaceholder text="예약 가능한 시간이 없어요" />
        );
    }

    if (isDayBooking) {
        return (
            <TimePlaceholder
                text={onlySlot?.available === false
                    ? '이 날은 예약이 마감됐어요'
                    : '이 가게는 날짜만 선택하면 돼요'} />
        );
    }

    const am = slots.filter((s) => Number(s.time.split(':')[0]) < 12);
    const pm = slots.filter((s) => Number(s.time.split(':')[0]) >= 12);

    return (
        <div>
            {am.length > 0 && (
                <>
                    <div style={timeSlotStyles.groupLabel}>오전</div>
                    <div style={timeSlotStyles.grid}>
                        {am.map((s, i) => (
                            <TimeSlotPill key={s.time} slot={s} selected={value === s.time}
                                onClick={() => onChange?.(s.time)} delay={i * 40} />
                        ))}
                    </div>
                </>
            )}
            {pm.length > 0 && (
                <>
                    <div style={{ ...timeSlotStyles.groupLabel, marginTop: am.length > 0 ? 14 : 0 }}>오후</div>
                    <div style={timeSlotStyles.grid}>
                        {pm.map((s, i) => (
                            <TimeSlotPill key={s.time} slot={s} selected={value === s.time}
                                onClick={() => onChange?.(s.time)} delay={i * 40} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

const TimeSlotPill = ({ slot, selected, onClick, delay }) => (
    <button type="button"
        className={`rsv-tap-btn rsv-time-pill${selected ? ' rsv-selected' : ''}`}
        disabled={!slot.available} onClick={onClick}
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
 *   바로 위 "예약 날짜"(진짜 DatePicker)는 미입력 시 아이콘이 빨개지는데
 *   "예약 시간"만 회색으로 남아 **같은 폼에서 두 칸이 다르게 반응**했다.
 *   → Form.Item.useStatus() 로 에러 상태를 직접 읽어 같은 언어로 반응시킨다.
 *
 *   타이포도 함께 맞췄다. DatePicker 의 placeholder 는 실제 <input> 의 ::placeholder 라
 *   폰트·크기가 AntD 토큰을 따르는데, 이쪽은 <span> 이라 상속 경로가 달랐다.
 *   fontFamily: inherit 를 명시하고 아이콘 크기를 AntD suffix(16px)에 맞춘다.
 */
const TimePlaceholder = ({ text }) => {
    const { status } = Form.Item.useStatus();
    const isError = status === 'error';
    // 테두리는 그리지 않는다 — 날짜 칸(AntD DatePicker)이 filled variant 라 에러에도 선이
    // 생기지 않는다. 여기만 선을 그리면 두 칸이 또 달라 보인다(그게 원래 문제였다).
    // 에러 신호는 아이콘 색 + 아래 빨간 안내문으로 충분하다.
    return (
        <div style={timeSlotStyles.placeholder}>
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
        //   바로 옆 FormDatePicker의 "날짜 선택"과 톤이 정확히 일치한다.
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

/** 달력에서 회색으로 막힌 이유를 미리 알려준다 — 막아만 두면 "왜 안 눌리지"가 된다. */
const bookingRangeHint = (store) => {
    const days = (store?.closedDays ?? []);
    const labels = ['', '월', '화', '수', '목', '금', '토', '일'];
    const parts = [];
    if (days.length > 0) parts.push(`매주 ${days.map(d => labels[d]).join('·')} 휴무`);
    // 운영 기간은 제일 앞에 세운다 — 기간 자체가 끝났으면 나머지 안내가 의미가 없다.
    if (store?.openDate && store?.closeDate) parts.unshift(`${store.openDate} ~ ${store.closeDate} 운영`);
    else if (store?.closeDate) parts.unshift(`${store.closeDate}까지 운영`);
    else if (store?.openDate) parts.unshift(`${store.openDate}부터 운영`);
    if (store?.maxAdvanceBookingDays > 0) parts.push(`${store.maxAdvanceBookingDays}일 이내만 예약 가능`);
    if (parts.length === 0) return null;
    return (
        <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
            {parts.join(' · ')}
        </Text>
    );
};

const ReservationPanel = ({ store, form, onFinish, paying, isPC, isEditMode }) => {
    const dateValue = Form.useWatch('reservationDate', form);
    return (
    <div style={isPC ? pcFormStyles.panel : {}}>
        <Title level={3} style={{ marginTop: 0, marginBottom: 20, fontWeight: fontWeight.bold }}>
            {isEditMode ? '예약 수정하기' : '예약하기'}
        </Title>
        <Form form={form} layout="vertical" onFinish={onFinish}
            initialValues={{ guestCount: 1 }} requiredMark={false}
            style={{ fontWeight: fontWeight.medium }}>
            <Form.Item label="예약 날짜" name="reservationDate"
                rules={[{ required: true, message: '날짜를 선택해주세요.' }]}
                extra={bookingRangeHint(store)}>
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
                label={store?.bookingType === 'DAY' ? '예약 확인' : (store?.bookingType === 'SESSION' ? '회차 선택' : '예약 시간')}
                name="reservationTime"
                rules={[{ required: true, message: store?.bookingType === 'DAY' ? '날짜를 선택해주세요.' : '시간을 선택해주세요.' }]}>
                <TimeSlotPicker store={store} dateValue={dateValue} form={form} />
            </Form.Item>
            <Form.Item label="인원 수" name="guestCount" rules={VALIDATION_RULES.guestCount}>
                <GuestCountInput />
            </Form.Item>
            <Form.Item label="요청 사항" name="specialRequest">
                <FormTextArea rows={3} placeholder="요청 사항을 입력하세요." />
            </Form.Item>
            <div style={{ marginTop: 24 }}>
                <Button variant="primary" htmlType="submit" block loading={paying}>
                    {paying ? '처리 중...' : (isEditMode ? '예약 수정하기' : '예약 신청하기')}
                </Button>
            </div>
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

const StoreDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { message } = useMessage();
    const { isLoggedIn, user } = useAuthStore();
    const { pay, paying } = usePayment();
    const { store, loading, error } = useStoreData(id);
    const imageHint = useStoreImageHint(id);

    // 상세 데이터가 도착하면 이 가게의 커버 이미지 비율도 적어둔다 (2026-07 추가).
    // 목록을 거치지 않고 상세 URL로 바로 들어온 경우엔 미리 알 방법이 없지만(그 한 번은 1:1 폴백),
    // 한 번 본 뒤에는 새로고침하거나 다시 들어와도 스켈레톤이 정확한 비율로 뜨도록.
    useEffect(() => {
        if (store) rememberImageHints(store);
    }, [store]);
    const [form] = Form.useForm();
    const isPC = useWindowWidth() >= BREAKPOINT;

    // "우리동네" 배지 — StoreCard/StoreList와 동일한 원칙 및 우선순위(2026-07 수정):
    // 마이페이지에 저장된 위치가 있으면 그게 최우선이고, 없을 때만 이 세션에서 얻은 라이브 위치로
    // 폴백한다. "우리동네"는 사용자가 사는/자주 가는 동네라는 안정적인 개념이라, 거리순 정렬을
    // 한 번 눌러서 라이브 위치 권한을 허용했다고 그 뒤로 계속 그 위치 기준으로 바뀌면 안 된다
    // (예: 마이페이지엔 청와대로 저장해뒀는데 안산에서 거리순 한 번 누르면 그 뒤로는 별점순으로
    // 바꿔도 안산 근처 가게만 "우리동네"로 뜨는 문제 — StoreList.jsx의 nearbyUserLocation 참고).
    const { liveLocation } = useLocationStore();
    const nearbyUserLocation = (user?.latitude != null && user?.longitude != null)
        ? { latitude: user.latitude, longitude: user.longitude }
        : liveLocation;

    const {
        completedReservation,
        stateOpenWrite,
        stateOpenReviewId,
        reviewSectionRef,
        onFinish,
        isEditMode,
    } = useStoreDetailActions({ id, store, isLoggedIn, user, form, pay, message });

    React.useEffect(() => {
        if (error) message.error(error);
    }, [error, message]);
    useDocumentTitle(
        store?.name ?? null,
        store
            ? `${store.name} 예약 | ${store.category ? store.category + ' ' : ''}${store.address ? store.address + '. ' : ''}RESERVE에서 간편하게 예약하세요.`
            : undefined
    );

    // "뒤로가기"는 store 데이터와 무관한 완전 정적 요소(그냥 navigate(-1))라 로딩 상태와
    // 무관하게 항상 같은 실제 버튼으로 떠 있어야 함(2026-07 버그 수정) — 예전엔 loading일 때
    // StoreDetailSkeleton 안의 회색 막대(Bone)로 대체돼서, 페이지 로딩 중엔 뒤로 나갈 수 있는
    // 진짜 버튼이 아예 없었음. 로딩/데이터없음/로딩완료 세 갈래 모두에서 동일하게 렌더.
    const backButton = (
        <Button variant="ghost" onClick={() => navigate(-1)} style={styles.backBtn}>
            <ArrowLeftOutlined style={{ fontSize: 14 }} /> 뒤로가기
        </Button>
    );

    if (loading) return (
        <PageContainer size={isPC ? 'xl' : 'md'} paddingTop={isPC ? '32px' : '20px'}>
            {backButton}
            <StoreDetailSkeleton imageHint={imageHint} isPC={isPC} />
        </PageContainer>
    );
    if (!store) return (
        <PageContainer size={isPC ? 'xl' : 'md'} paddingTop={isPC ? '32px' : '20px'}>
            {backButton}
                        {/*
              * ★ "불러오기 실패" 와 "가게가 없음" 을 같은 문장으로 말하지 않는다(2026-08-29).
              *   예전엔 둘 다 "데이터가 없습니다." 였다. 그래서 서버가 잠깐 내려간 것뿐인데
              *   손님에게 **사실이 아닌 말**을 했고 — 다시 열면 될 상황을 가게가 사라진 것으로
              *   읽게 만들었다. 되돌아올 수 있는 상태를 되돌아올 수 없는 것처럼 말한 셈이다.
              *
              *   `error` 는 axios 인터셉터가 만든 완성된 문장이라 사유와 다음 행동이 이미 들어 있다
              *   ("서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요." / "정보를 찾을 수 없습니다.").
              *   그대로 쓰면 문구가 한 군데(axios.js)에서만 관리된다.
              */}
            <div style={{ textAlign: 'center', marginTop: 100 }}>
                {error ?? '요청하신 가게를 찾을 수 없습니다.'}
            </div>
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
    const containerSize = isPC ? 'xl' : 'md';
    const nearby = isNearby(nearbyUserLocation, store.latitude, store.longitude, store.nearbyRadiusKm ?? undefined);

    return (
        <PageContainer size={containerSize} paddingTop={isPC ? '32px' : '20px'}>
            <style>{customStyles}</style>

            {backButton}

            {isPC ? (
                <>
                    <div style={styles.pcGrid}>
                        <div style={styles.pcLeft}>
                            <div style={{ position: 'relative' }}>
                                <div style={styles.pcImageWrapper}>
                                    <Image.PreviewGroup items={sliderImages.map(getDetailImageUrl)} classNames={{ popup: { root: 'reserve-image-preview' } }}><Carousel className="reserve-carousel" infinite
                                        /* 터치 스와이프를 명시적으로 켠다. react-slick 은 기본값이 켜져 있지만,
                                           swipeToSlide 가 없으면 "슬라이드 폭의 일정 비율" 을 넘겨야만 넘어가서
                                           짧게 쓸면 제자리로 돌아온다 — 모바일에서 "안 넘어간다" 의 원인.
                                           touchThreshold 를 낮춰 감도도 올린다(기본 5는 둔하다). */
                                        draggable swipe touchMove swipeToSlide touchThreshold={12}
                                        dotPlacement="bottom" autoplay>
                                        {sliderImages.map((img, sliderIdx) => (
                                            <div key={img}>
                                                {/* draggable={false} — PC 마우스 드래그 스와이프용.
                                                    브라우저 기본 이미지 드래그가 slick 의 mousemove 를 가로채기 때문이다.
                                                    CSS 쪽(-webkit-user-drag)은 index.css 에 있고, 이 속성은 Firefox 용이다. */}
                                                <Image src={getDetailImageUrl(img)} alt={`${store.name}-${sliderIdx}`}
                                                    width="100%" style={styles.pcMainImg} draggable={false}
                                                    preview={{ mask: '크게 보기' }} />
                                            </div>
                                        ))}
                                    </Carousel></Image.PreviewGroup>
                                </div>
                                <div style={styles.imgFavBtn}>
                                    <FavoriteButton storeId={Number(id)} size="sm" />
                                </div>
                            </div>
                            <div style={{ marginTop: 20, marginBottom: 4 }}>
                                {store.category && <Badge variant="category">{store.category}</Badge>}
                                {nearby && <Badge variant="nearby">우리동네</Badge>}
                                {store.keywords?.map((kw) => <Badge key={kw} variant="keyword">{kw}</Badge>)}
                            </div>
                            <Title level={1} style={{ ...styles.storeTitle, marginTop: 8 }}>{store.name}</Title>
                            <div style={headerStyles.metaRow}>
                                <StarFilled style={{ color: '#fadb14', fontSize: 14 }} />
                                <Text strong style={{ fontSize: fontSize.sm }}>{store.rating?.toFixed(1) || '0.0'}</Text>
                                <Text type="secondary" style={{ fontSize: fontSize.xs }}>({store.reviewCount || 0})</Text>
                            </div>
                            <StoreInfoSection store={store} description={store.description} />
                            <div style={{ marginTop: 20, marginBottom: 8 }}>
                                <KakaoMap latitude={store.latitude} longitude={store.longitude}
                                    address={store.address} storeName={store.name} height={220} />
                            </div>
                        </div>
                        <div style={styles.pcRight}>
                            <ReservationPanel store={store} form={form} onFinish={onFinish} paying={paying} isPC={true} isEditMode={isEditMode} />
                        </div>
                    </div>
                    {/* 리뷰 섹션을 2단 레이아웃(pcGrid) 밖으로 분리(2026-07) — 예전엔 pcLeft 안에 있어서
                        예약 폼의 sticky 범위(부모 행 pcGrid가 다 스크롤될 때까지 폼이 화면에 붙어있음)가
                        리뷰 개수만큼 계속 늘어나, 리뷰가 많은 가게일수록 폼이 오래 "고정"된 채로 남아있었다.
                        풀와이드 섹션으로 빼서 sticky 범위를 갤러리+정보+지도까지로 줄이고, 리뷰는 더 넓은
                        폭(540→720)으로 보여준다. 폭은 취향껏 다시 조정 가능. */}
                    <Divider style={styles.divider} />
                    <section ref={reviewSectionRef}>
                        <Title level={3} style={styles.sectionTitle}>리뷰</Title>
                        <ReviewList storeId={Number(id)} completedReservation={completedReservation}
                            autoOpenWrite={stateOpenWrite} focusReviewId={stateOpenReviewId} isPC />
                    </section>
                </>
            ) : (
                <>
                    <section style={{ padding: 0 }}>
                        <div style={{ position: 'relative' }}>
                            <div style={styles.mobileImageWrapper}>
                                <Image.PreviewGroup items={sliderImages.map(getDetailImageUrl)} classNames={{ popup: { root: 'reserve-image-preview' } }}><Carousel className="reserve-carousel" infinite
                                        /* 터치 스와이프를 명시적으로 켠다. react-slick 은 기본값이 켜져 있지만,
                                           swipeToSlide 가 없으면 "슬라이드 폭의 일정 비율" 을 넘겨야만 넘어가서
                                           짧게 쓸면 제자리로 돌아온다 — 모바일에서 "안 넘어간다" 의 원인.
                                           touchThreshold 를 낮춰 감도도 올린다(기본 5는 둔하다). */
                                        draggable swipe touchMove swipeToSlide touchThreshold={12}
                                        dotPlacement="bottom" autoplay>
                                    {sliderImages.map((img, sliderIdx) => (
                                        <div key={img}>
                                            <Image src={getDetailImageUrl(img)} alt={`${store.name}-${sliderIdx}`}
                                                width="100%" style={styles.mainImg} draggable={false}
                                                preview={{ mask: '크게 보기' }} />
                                        </div>
                                    ))}
                                </Carousel></Image.PreviewGroup>
                            </div>
                            <div style={styles.imgFavBtn}>
                                <FavoriteButton storeId={Number(id)} size="sm" />
                            </div>
                        </div>
                        <div style={{ padding: '0 16px' }}>
                            <div style={{ marginTop: 20, marginBottom: 4 }}>
                                {store.category && <Badge variant="category">{store.category}</Badge>}
                                {nearby && <Badge variant="nearby">우리동네</Badge>}
                                {store.keywords?.map((kw) => <Badge key={kw} variant="keyword">{kw}</Badge>)}
                            </div>
                            <Title level={1} style={{ ...styles.storeTitle, marginTop: 8 }}>{store.name}</Title>
                            <div style={headerStyles.metaRow}>
                                <StarFilled style={{ color: '#fadb14', fontSize: 14 }} />
                                <Text strong style={{ fontSize: fontSize.sm }}>{store.rating?.toFixed(1) || '0.0'}</Text>
                                <Text type="secondary" style={{ fontSize: fontSize.xs }}>({store.reviewCount || 0})</Text>
                            </div>
                        </div>
                    </section>
                    <div style={{ padding: '0 16px' }}>
                        <StoreInfoSection store={store} description={store.description} />
                        <div style={{ marginTop: 16, marginBottom: 8 }}>
                            <KakaoMap latitude={store.latitude} longitude={store.longitude}
                                address={store.address} storeName={store.name} height={200} />
                        </div>
                    </div>
                    <Divider style={styles.divider} />
                    <section style={{ padding: '0 16px' }}>
                        <ReservationPanel store={store} form={form} onFinish={onFinish} paying={paying} isPC={false} isEditMode={isEditMode} />
                    </section>
                    <Divider style={styles.divider} />
                    <section ref={reviewSectionRef} style={{ padding: '0 16px' }}>
                        <Title level={3} style={styles.sectionTitle}>리뷰</Title>
                        <ReviewList storeId={Number(id)} completedReservation={completedReservation}
                            autoOpenWrite={stateOpenWrite} focusReviewId={stateOpenReviewId} />
                    </section>
                </>
            )}
        </PageContainer>
    );
};

const headerStyles = {
    metaRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexWrap: 'wrap',
        marginBottom: 16,
    },
};

const styles = {
    backBtn:          { marginBottom: 12, padding: '4px 8px', fontSize: fontSize.sm, color: colors.text.secondary },
    storeTitle:       { fontSize: fontSize['5xl'], fontWeight: fontWeight.extrabold, marginBottom: 12, marginTop: 20 },
    divider:          { margin: '24px 0' },
    sectionTitle:     { marginTop: 0, marginBottom: 20, fontWeight: fontWeight.bold },
    mainImg:          { width: '100%', height: 'auto', display: 'block' },
    pcGrid:           { display: 'flex', gap: 36, alignItems: 'flex-start' },
    pcLeft:           { flex: '0 0 50%', minWidth: 0, maxWidth: 560 },
    pcRight:          { flex: 1, minWidth: 320, maxWidth: 440, position: 'sticky', top: 80, alignSelf: 'flex-start' },
    pcImageWrapper:   { width: '100%', overflow: 'hidden', borderRadius: radius.xl, lineHeight: 0 }, 
    pcMainImg:        { width: '100%', height: 'auto', display: 'block' },
    mobileImageWrapper: { width: '100%', overflow: 'hidden', marginBottom: 0, lineHeight: 0, borderRadius: radius.xl }, 
    
    imgFavBtn:        { position: 'absolute', top: 12, right: 12, zIndex: 5 },
};

export default StoreDetail;
