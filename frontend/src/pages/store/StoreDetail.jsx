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
import dayjs from 'dayjs';
import { PageContainer, Button, FormTextArea, FormDatePicker, FavoriteButton, Badge, KakaoMap, StoreDetailSkeleton } from '../../components/common';
import { ReviewList } from '../../components/review';
import { useStoreData, useMessage, usePayment, useWindowWidth, useStoreDetailActions, useStoreImageHint } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { rememberImageHints } from '../../utils/imageHintCache';
import { getDetailImageUrl } from '../../utils';
import { isNearby } from '../../utils/distance';
import useLocationStore from '../../store/useLocationStore';
import { colors, radius, fontWeight, fontSize, heights, animation } from '../../styles/tokens';
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
  .ant-carousel { overflow: hidden !important; }
  .ant-carousel .slick-list { background: transparent !important; border: none !important; box-shadow: none !important; }
  .ant-carousel .slick-slide > div { line-height: 0 !important; font-size: 0 !important; }
  .ant-carousel .slick-prev::after, .ant-carousel .slick-next::after { display: none !important; }
  .ant-carousel .slick-prev, .ant-carousel .slick-next {
    z-index: 10 !important; width: 40px !important; height: 40px !important; background: none !important;
    top: 50% !important; transform: translateY(-50%) !important; display: flex !important;
    align-items: center !important; justify-content: center !important;
  }
  .ant-carousel .slick-prev::before, .ant-carousel .slick-next::before {
    content: '' !important; display: block !important; width: 12px !important; height: 12px !important;
    border-top: 2.5px solid rgba(255,255,255,0.9) !important; border-right: 2.5px solid rgba(255,255,255,0.9) !important;
    transition: all 0.2s ease !important; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)) !important;
  }
  .ant-carousel .slick-prev::before { transform: rotate(-135deg) !important; margin-left: 6px !important; }
  .ant-carousel .slick-next::before { transform: rotate(45deg) !important; margin-right: 6px !important; }
  .ant-carousel .slick-dots { bottom: 15px !important; display: flex !important; justify-content: center !important; line-height: 0 !important; }
  .ant-carousel .slick-dots li { margin: 0 4px !important; }
  .ant-carousel .slick-dots li button { background: #fff !important; opacity: 0.5 !important; width: 6px !important; height: 6px !important; border-radius: 50% !important; padding: 0 !important; }
  .ant-carousel .slick-dots li.slick-active button { opacity: 1 !important; width: 16px !important; border-radius: 10px !important; }
  .ant-carousel .slick-prev { left: 10px !important; }
  .ant-carousel .slick-next { right: 10px !important; }
  .ant-carousel .slick-slide[aria-hidden="true"] { visibility: hidden; }
  
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

    if (!dateKey) {
        return (
            <div style={timeSlotStyles.placeholder}>
                <span>날짜를 먼저 선택해주세요</span>
                <ClockCircleOutlined style={timeSlotStyles.placeholderIcon} />
            </div>
        );
    }
    if (loading) {
        return (
            <div style={timeSlotStyles.placeholder}>
                <span>불러오는 중...</span>
                <ClockCircleOutlined style={timeSlotStyles.placeholderIcon} />
            </div>
        );
    }
    if (slots.length === 0) {
        return (
            <div style={timeSlotStyles.placeholder}>
                <span>예약 가능한 시간이 없어요</span>
                <ClockCircleOutlined style={timeSlotStyles.placeholderIcon} />
            </div>
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

const timeSlotStyles = {
    placeholder: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: heights.input, padding: '0 11px', boxSizing: 'border-box',
        fontSize: fontSize.lg, fontWeight: fontWeight.regular, color: 'rgba(0, 0, 0, 0.25)',
        background: colors.gray[50], borderRadius: radius.lg,
    },
    placeholderIcon: { fontSize: 14, color: 'rgba(0, 0, 0, 0.25)' },
    groupLabel: { fontSize: fontSize.sm, color: colors.text.tertiary, fontWeight: fontWeight.medium, marginBottom: 8 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
    pill: {
        padding: '9px 0', borderRadius: radius.md, border: 'none',
        fontSize: fontSize.sm, fontWeight: fontWeight.medium, cursor: 'pointer',
    },
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
                rules={[{ required: true, message: '날짜를 선택해주세요.' }]}>
                <FormDatePicker placeholder="날짜 선택"
                    disabledDate={(d) => d && d.isBefore(dayjs().startOf('day'))} />
            </Form.Item>
            <Form.Item label="예약 시간" name="reservationTime"
                rules={[{ required: true, message: '시간을 선택해주세요.' }]}>
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
            <div style={{ textAlign: 'center', marginTop: 100 }}>데이터가 없습니다.</div>
        </PageContainer>
    );

    const sliderImages = store.detailImageUrls?.length > 0 ? store.detailImageUrls : [store.mainImageUrl];
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
                                    <Image.PreviewGroup preview={{ rootClassName: 'reserve-image-preview' }}><Carousel arrows infinite draggable dotPlacement="bottom" autoplay>
                                        {sliderImages.map((img, sliderIdx) => (
                                            <div key={img}>
                                                <Image src={getDetailImageUrl(img)} alt={`${store.name}-${sliderIdx}`}
                                                    width="100%" style={styles.pcMainImg}
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
                                <Image.PreviewGroup preview={{ rootClassName: 'reserve-image-preview' }}><Carousel arrows infinite draggable dotPlacement="bottom" autoplay>
                                    {sliderImages.map((img, sliderIdx) => (
                                        <div key={img}>
                                            <Image src={getDetailImageUrl(img)} alt={`${store.name}-${sliderIdx}`}
                                                width="100%" style={styles.mainImg}
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
