import React from 'react';
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
import { PageContainer, Button, FormTextArea, FormDatePicker, FormTimePicker, FavoriteButton, Badge, KakaoMap, StoreDetailSkeleton } from '../../components/common';
import { ReviewList } from '../../components/review';
import { useStoreData, useMessage, usePayment, useWindowWidth, useStoreDetailActions } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getDetailImageUrl } from '../../utils';
import { colors, radius, fontWeight, fontSize, heights } from '../../styles/tokens';
import { VALIDATION_RULES } from '../../utils/validation';

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
  .ant-image { width: 100% !important; }
  .ant-image-img { width: 100% !important; height: auto !important; display: block !important; }
  .slick-slide[aria-hidden="true"] * { pointer-events: none; }
`;

// 인원 수 입력 스텝퍼
const GuestCountInput = ({ value = 1, onChange }) => {
    const dec = () => { if (value > 1) onChange?.(value - 1); };
    const inc = () => { if (value < 99) onChange?.(value + 1); };
    return (
        <div style={inputStyles.wrapper}>
            <span style={inputStyles.count}>{value}명</span>
            <div style={inputStyles.btnGroup}>
                <button type="button" onClick={dec} style={{ ...inputStyles.btn, opacity: value <= 1 ? 0.35 : 1 }}>
                    <MinusOutlined style={{ fontSize: 12 }} />
                </button>
                <button type="button" onClick={inc} style={inputStyles.btn}>
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

// buildDisabledTime 헬퍼: 모듈 레벨에 두어 중첩 깊이 감소
const toMins = (timeStr) => {
    const [h, m] = timeStr.substring(0, 5).split(':').map(Number);
    return h * 60 + m;
};

const getDisabledHours = (slotMin, isValidSlot) => {
    const disabled = [];
    for (let h = 0; h < 24; h++) {
        const hasValid = Array.from({ length: Math.ceil(60 / slotMin) }, (_, i) => i * slotMin)
            .some(m => isValidSlot(h * 60 + m));
        if (!hasValid) disabled.push(h);
    }
    return disabled;
};

const getDisabledMinutes = (hour, isValidSlot) =>
    Array.from({ length: 60 }, (_, m) => m).filter(m => !isValidSlot(hour * 60 + m));

const buildDisabledTime = (store) => {
    if (!store?.openTime || !store?.closeTime) return undefined;

    const openMins   = toMins(store.openTime);
    const closeMins  = toMins(store.closeTime);
    const slotMin    = store.reservationSlotMinutes ?? 30;
    const bStartMins = store.breakStartTime ? toMins(store.breakStartTime) : -1;
    const bEndMins   = store.breakEndTime   ? toMins(store.breakEndTime)   : -1;
    const hasBreak   = bStartMins >= 0 && bEndMins >= 0;

    const isValidSlot = (totalMins) =>
        totalMins >= openMins &&
        totalMins <= closeMins &&
        (!hasBreak || totalMins < bStartMins || totalMins >= bEndMins);

    return () => ({
        disabledHours:   () => getDisabledHours(slotMin, isValidSlot),
        disabledMinutes: (hour) => getDisabledMinutes(hour, isValidSlot),
    });
};

const ReservationPanel = ({ store, form, onFinish, paying, isPC }) => {
    const disabledTime = React.useMemo(() => buildDisabledTime(store), [store]);
    return (
    <div style={isPC ? pcFormStyles.panel : {}}>
        <Title level={3} style={{ marginTop: 0, marginBottom: 20, fontWeight: fontWeight.bold }}>
            예약하기
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
                <FormTimePicker
                    placeholder={store?.openTime && store?.closeTime
                        ? `${store.openTime.substring(0, 5)} ~ ${store.closeTime.substring(0, 5)}` : '시간 선택'}
                    hideDisabledOptions
                    minuteStep={store?.reservationSlotMinutes ?? 30}
                    disabledTime={disabledTime}
                />
            </Form.Item>
            <Form.Item label="인원 수" name="guestCount" rules={VALIDATION_RULES.guestCount}>
                <GuestCountInput />
            </Form.Item>
            <Form.Item label="요청 사항" name="specialRequest">
                <FormTextArea rows={3} placeholder="요청 사항을 입력하세요." />
            </Form.Item>
            <div style={{ marginTop: 24 }}>
                <Button variant="primary" htmlType="submit" block loading={paying}>
                    {paying ? '결제 진행 중...' : '예약 신청하기'}
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
    const [form] = Form.useForm();
    const isPC = useWindowWidth() >= BREAKPOINT;

    const {
        completedReservation,
        stateOpenWrite,
        stateOpenReviewId,
        reviewSectionRef,
        onFinish,
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

    if (loading) return (
        <PageContainer size={isPC ? 'xl' : 'md'} paddingTop={isPC ? '32px' : '20px'}>
            <StoreDetailSkeleton />
        </PageContainer>
    );
    if (!store) return <div style={{ textAlign: 'center', marginTop: 100 }}>데이터가 없습니다.</div>;

    const sliderImages = store.detailImageUrls?.length > 0 ? store.detailImageUrls : [store.mainImageUrl];
    const containerSize = isPC ? 'xl' : 'md';

    return (
        <PageContainer size={containerSize} paddingTop={isPC ? '32px' : '20px'}>
            <style>{customStyles}</style>

            <Button variant="ghost" onClick={() => navigate(-1)} style={styles.backBtn}>
                <ArrowLeftOutlined style={{ fontSize: 14 }} /> 뒤로가기
            </Button>

            {isPC ? (
                <div style={styles.pcGrid}>
                    <div style={styles.pcLeft}>
                        <div style={{ position: 'relative' }}>
                            <div style={styles.pcImageWrapper}>
                                <Carousel arrows infinite draggable dotPlacement="bottom" autoplay>
                                    {sliderImages.map((img, sliderIdx) => (
                                        <div key={img}>
                                            <Image src={getDetailImageUrl(img)} alt={`${store.name}-${sliderIdx}`}
                                                width="100%" style={styles.pcMainImg}
                                                preview={{ mask: '크게 보기' }} />
                                        </div>
                                    ))}
                                </Carousel>
                            </div>
                            <div style={styles.imgFavBtn}>
                                <FavoriteButton storeId={Number(id)} size="sm" />
                            </div>
                        </div>
                        <div style={{ marginTop: 20, marginBottom: 4 }}>
                            {store.category && <Badge variant="category">{store.category}</Badge>}
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
                        <Divider style={styles.divider} />
                        <section ref={reviewSectionRef} style={{ maxWidth: 540 }}>
                            <Title level={3} style={styles.sectionTitle}>리뷰</Title>
                            <ReviewList storeId={Number(id)} completedReservation={completedReservation}
                                autoOpenWrite={stateOpenWrite} focusReviewId={stateOpenReviewId} />
                        </section>
                    </div>
                    <div style={styles.pcRight}>
                        <ReservationPanel store={store} form={form} onFinish={onFinish} paying={paying} isPC={true} />
                    </div>
                </div>
            ) : (
                <>
                    <section style={{ padding: 0 }}>
                        <div style={{ position: 'relative' }}>
                            <div style={styles.mobileImageWrapper}>
                                <Carousel arrows infinite draggable dotPlacement="bottom" autoplay>
                                    {sliderImages.map((img, sliderIdx) => (
                                        <div key={img}>
                                            <Image src={getDetailImageUrl(img)} alt={`${store.name}-${sliderIdx}`}
                                                width="100%" style={styles.mainImg}
                                                preview={{ mask: '크게 보기' }} />
                                        </div>
                                    ))}
                                </Carousel>
                            </div>
                            <div style={styles.imgFavBtn}>
                                <FavoriteButton storeId={Number(id)} size="sm" />
                            </div>
                        </div>
                        <div style={{ padding: '0 16px' }}>
                            <div style={{ marginTop: 20, marginBottom: 4 }}>
                                {store.category && <Badge variant="category">{store.category}</Badge>}
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
                        <ReservationPanel store={store} form={form} onFinish={onFinish} paying={paying} isPC={false} />
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
