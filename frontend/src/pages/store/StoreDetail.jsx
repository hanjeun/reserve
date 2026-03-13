import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { Image, Typography, Form, Carousel, Divider } from 'antd';
import {
    PlusOutlined, MinusOutlined, ArrowLeftOutlined,
    ClockCircleOutlined, CreditCardOutlined, FieldTimeOutlined,
    ThunderboltOutlined, RollbackOutlined, HourglassOutlined, TeamOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageContainer, Button, FormTextArea, FormDatePicker, FormTimePicker, FavoriteButton } from '../../components/common';
import { ReviewList } from '../../components/review';
import { StoreDetailSkeleton } from '../../components/common';
import { useStoreData, useMessage, usePayment } from '../../hooks';
import { getDetailImageUrl, formatTimeForApi, formatDate } from '../../utils';
import { colors, radius, fontWeight, fontSize, heights } from '../../styles/tokens';
import { reservationService, favoriteService } from '../../services';
import { VALIDATION_RULES } from '../../utils/validation';

const { Title, Text } = Typography;

// ─── 반응형 브레이크포인트 ────────────────
const BREAKPOINT = 900;
const useIsPC = () => {
    const [isPC, setIsPC] = React.useState(
        typeof window !== 'undefined' ? window.innerWidth >= BREAKPOINT : false
    );
    React.useEffect(() => {
        const h = () => setIsPC(window.innerWidth >= BREAKPOINT);
        window.addEventListener('resize', h);
        return () => window.removeEventListener('resize', h);
    }, []);
    return isPC;
};

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

// ─── 인원 수 스텝퍼 ──────────────────────
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

// ─── 가게 운영 정보 섹션 ──────────────────
const StoreInfoSection = ({ store, description }) => {
    const rows = [];

    if (store.openTime && store.closeTime) {
        rows.push({
            Icon: ClockCircleOutlined, label: '영업 시간',
            value: `${store.openTime.substring(0, 5)} ~ ${store.closeTime.substring(0, 5)}`,
        });
    }
    if (store.noShowDeposit > 0) {
        rows.push({
            Icon: CreditCardOutlined, label: '노쇼 예약금',
            value: `${Number(store.noShowDeposit).toLocaleString('ko-KR')}원 (예약 시 결제)`,
            highlight: true,
        });
    }
    const hasRefundPolicy = store.fullRefundDays > 0 || store.partialRefundDays > 0;
    if (store.noShowDeposit > 0 && hasRefundPolicy) {
        const parts = [];
        if (store.fullRefundDays > 0) parts.push(`방문 ${store.fullRefundDays}일 전까지 전액 환불`);
        if (store.partialRefundDays > 0 && store.partialRefundRate > 0)
            parts.push(`방문 ${store.partialRefundDays}일 전까지 ${store.partialRefundRate}% 환불`);
        parts.push('이후 환불 불가');
        rows.push({ Icon: RollbackOutlined, label: '환불 정책', value: parts, isMultiLine: true });
    }
    if (store.bookingDeadlineHours > 0) {
        rows.push({
            Icon: FieldTimeOutlined, label: '예약 마감',
            value: `방문 ${store.bookingDeadlineHours}시간 전까지 예약 가능`,
        });
    }
    if (store.noShowDeposit > 0 && store.paymentTimeoutMinutes > 0) {
        const ptMin = store.paymentTimeoutMinutes;
        const ptLabel = ptMin < 60 ? `${ptMin}분`
            : ptMin % 60 === 0 ? `${ptMin / 60}시간`
            : `${Math.floor(ptMin / 60)}시간 ${ptMin % 60}분`;
        rows.push({
            Icon: ThunderboltOutlined, label: '결제 마감',
            value: `예약 후 ${ptLabel} 이내 미결제 시 자동 취소`,
        });
    }
    const slotMin = store.reservationSlotMinutes ?? 30;
    const slotLabel = slotMin < 60 ? `${slotMin}분`
        : slotMin % 60 === 0 ? `${slotMin / 60}시간`
        : `${Math.floor(slotMin / 60)}시간 ${slotMin % 60}분`;
    rows.push({ Icon: HourglassOutlined, label: '예약 단위', value: `${slotLabel} 단위로 예약 가능` });
    if (store.maxCapacityPerSlot > 0) {
        rows.push({ Icon: TeamOutlined, label: '동시간대 최대', value: `${store.maxCapacityPerSlot}명` });
    }

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
                            {row.isMultiLine
                                ? row.value.map((v, vi) => (
                                    <div key={vi} style={vi === row.value.length - 1 ? { color: colors.error?.main || '#ff4d4f' } : {}}>{v}</div>
                                ))
                                : row.value}
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

// ─── 예약 폼 패널 (PC용 sticky 사이드바 / 모바일용 하단 섹션) ──
const ReservationPanel = ({ store, form, onFinish, paying, isPC }) => (
    <div style={isPC ? pcFormStyles.panel : {}}>
        <Title level={3} style={{ marginTop: 0, marginBottom: 20, fontWeight: fontWeight.bold }}>
            실시간 예약하기
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
                    minuteStep={store?.reservationSlotMinutes ?? 30} />
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

const pcFormStyles = {
    panel: {
        position: 'sticky',
        top: 80,
        background: colors.background.paper,
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.light}`,
        padding: '28px 24px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    },
};

// ─── 메인 컴포넌트 ────────────────────────
const StoreDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { message } = useMessage();
    const { isLoggedIn, user } = useAuthStore();
    const { pay, paying } = usePayment();
    const { store, loading, error } = useStoreData(id);
    const [form] = Form.useForm();
    const isPC = useIsPC();

    const [completedReservation, setCompletedReservation] = React.useState(null);
    const [favoriteStatus, setFavoriteStatus] = React.useState(false);
    const stateOpenWrite    = location.state?.openWrite    ?? false;
    const stateOpenReviewId = location.state?.openReviewId ?? null;
    const reviewSectionRef  = React.useRef(null);

    React.useEffect(() => {
        if (error) message.error(error);
    }, [error]); // eslint-disable-line

    // 찜 초기 상태 로딩 (로그인 여부 무관하게 확인 가능)
    React.useEffect(() => {
        favoriteService.getStatus(Number(id))
            .then(res => setFavoriteStatus(res?.isFavorite ?? false))
            .catch(() => {});
    }, [id]); // eslint-disable-line

    React.useEffect(() => {
        if (!isLoggedIn) return;
        reservationService.getMyReservations().then(list => {
            const num = Number(id);
            const sorted = (list ?? []).filter(r => r.storeId === num).sort((a, b) => b.id - a.id);
            const completed = sorted.find(r => r.status === 'COMPLETED') ?? null;
            if (completed) setCompletedReservation({ reservationId: completed.id, reviewId: completed.reviewId ?? null });
        }).catch(() => {});
    }, [id, isLoggedIn]); // eslint-disable-line

    React.useEffect(() => {
        if ((stateOpenWrite || stateOpenReviewId) && reviewSectionRef.current) {
            const t = setTimeout(() => reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
            return () => clearTimeout(t);
        }
    }, [stateOpenWrite, stateOpenReviewId]); // eslint-disable-line

    const onFinish = async (values) => {
        if (!isLoggedIn) { message.warning('로그인이 필요한 서비스입니다.'); navigate('/login'); return; }
        const dt = values.reservationDate
            .hour(values.reservationTime.hour()).minute(values.reservationTime.minute()).second(0).millisecond(0);
        if (dt.isBefore(dayjs())) {
            form.setFields([{ name: 'reservationTime', errors: ['이미 지나간 시간입니다.'] }]); return;
        }
        if (store?.openTime && store?.closeTime) {
            const t = values.reservationTime.format('HH:mm');
            if (t < store.openTime.substring(0, 5) || t > store.closeTime.substring(0, 5)) {
                form.setFields([{ name: 'reservationTime', errors: [`영업시간(${store.openTime.substring(0, 5)} ~ ${store.closeTime.substring(0, 5)}) 내에서 선택해주세요.`] }]); return;
            }
        }
        try {
            const hasDeposit  = store?.noShowDeposit > 0;
            const skipPayment = hasDeposit && store?.allowLatePayment === true;
            const reservation = await reservationService.createReservation({
                ...values, storeId: Number(id),
                reservationDate: formatDate(values.reservationDate),
                reservationTime: formatTimeForApi(values.reservationTime),
                ...(skipPayment && { skipPayment: true }),
            });
            if (reservation?.depositAmount > 0) {
                if (store?.allowLatePayment) {
                    message.success({ content: `예약이 완료되었습니다. 예약금(${Number(reservation.depositAmount).toLocaleString('ko-KR')}원)은 나중에 결제해주세요.`, duration: 4 });
                    navigate('/my-reservations');
                } else {
                    message.info({ content: '예약이 접수되었습니다. 노쇼 예약금을 결제해주세요.', duration: 3 });
                    await pay(
                        { id: reservation.id, storeName: store?.name, depositAmount: reservation.depositAmount },
                        { name: user?.name, email: user?.email, phone: user?.phone }
                    );
                }
                return;
            }
            message.success('예약이 완료되었습니다!');
            navigate('/my-reservations');
        } catch (err) {
            message.error({ content: typeof err === 'string' ? err : '예약에 실패했습니다. 다시 시도해주세요.', duration: 5 });
        }
    };

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

            {/* 뒤로가기 */}
            <Button variant="ghost" onClick={() => navigate(-1)} style={styles.backBtn}>
                <ArrowLeftOutlined style={{ fontSize: 14 }} /> 뒤로가기
            </Button>

            {isPC ? (
                /* ════ PC: 왼쪽 콘텐츠 / 오른쪽 예약폼 ════ */
                <div style={styles.pcGrid}>
                    {/* 왼쪽 */}
                    <div style={styles.pcLeft}>
                        {/* 이미지 캐러셀 + 찜 버튼 */}
                        <div style={{ position: 'relative' }}>
                            <div style={styles.pcImageWrapper}>
                                <Carousel arrows infinite draggable dotPlacement="bottom" autoplay>
                                    {sliderImages.map((img, i) => (
                                        <div key={i}>
                                            <Image src={getDetailImageUrl(img)} alt={`${store.name}-${i}`}
                                                width="100%" style={styles.pcMainImg}
                                                preview={{ mask: '클릭해서 확대' }} />
                                        </div>
                                    ))}
                                </Carousel>
                            </div>
                            <div style={styles.imgFavBtn}>
                                <FavoriteButton storeId={Number(id)} initialStatus={favoriteStatus} size="sm" />
                            </div>
                        </div>

                        {/* 가게명 */}
                        <Title level={1} style={styles.storeTitle}>{store.name}</Title>

                        {/* 운영 정보 */}
                        <StoreInfoSection store={store} description={store.description} />

                        <Divider style={styles.divider} />

                        {/* 리뷰 */}
                        <section ref={reviewSectionRef} style={{ maxWidth: 540 }}>
                            <Title level={3} style={styles.sectionTitle}>리뷰</Title>
                            <ReviewList
                                storeId={Number(id)}
                                completedReservation={completedReservation}
                                autoOpenWrite={stateOpenWrite}
                                focusReviewId={stateOpenReviewId}
                            />
                        </section>
                    </div>

                    {/* 오른쪽: sticky 예약폼 */}
                    <div style={styles.pcRight}>
                        <ReservationPanel
                            store={store} form={form} onFinish={onFinish}
                            paying={paying} isPC={true} />
                    </div>
                </div>
            ) : (
                /* ════ 모바일: 단일 컬럼 ════ */
                <>
                    <section style={{ padding: 0 }}>
                        <div style={{ position: 'relative' }}>
                            <div style={styles.mobileImageWrapper}>
                                <Carousel arrows infinite draggable dotPlacement="bottom" autoplay>
                                    {sliderImages.map((img, i) => (
                                        <div key={i}>
                                            <Image src={getDetailImageUrl(img)} alt={`${store.name}-${i}`}
                                                width="100%" style={styles.mainImg}
                                                preview={{ mask: '클릭해서 확대' }} />
                                        </div>
                                    ))}
                                </Carousel>
                            </div>
                            <div style={styles.imgFavBtn}>
                                <FavoriteButton storeId={Number(id)} initialStatus={favoriteStatus} size="sm" />
                            </div>
                        </div>
                        <div style={{ padding: '0 16px' }}>
                            <Title level={1} style={styles.storeTitle}>{store.name}</Title>
                        </div>
                    </section>

                    <div style={{ padding: '0 16px' }}>
                        <StoreInfoSection store={store} description={store.description} />
                    </div>

                    <Divider style={styles.divider} />

                    <section style={{ padding: '0 16px' }}>
                        <ReservationPanel
                            store={store} form={form} onFinish={onFinish}
                            paying={paying} isPC={false} />
                    </section>

                    <Divider style={styles.divider} />

                    <section ref={reviewSectionRef} style={{ padding: '0 16px' }}>
                        <Title level={3} style={styles.sectionTitle}>리뷰</Title>
                        <ReviewList
                            storeId={Number(id)}
                            completedReservation={completedReservation}
                            autoOpenWrite={stateOpenWrite}
                            focusReviewId={stateOpenReviewId}
                        />
                    </section>
                </>
            )}
        </PageContainer>
    );
};

const styles = {
    backBtn: { marginBottom: 12, padding: '4px 8px', fontSize: fontSize.sm, color: colors.text.secondary },
    storeTitle: { fontSize: fontSize['5xl'], fontWeight: fontWeight.extrabold, marginBottom: 12, marginTop: 20 },
    divider: { margin: '24px 0' },
    sectionTitle: { marginTop: 0, marginBottom: 20, fontWeight: fontWeight.bold },
    mainImg: { width: '100%', height: 'auto', display: 'block' },

    // PC 전용
    pcGrid: {
        display: 'flex',
        gap: 36,
        alignItems: 'flex-start',
    },
    pcLeft: {
        flex: '0 0 50%',
        minWidth: 0,
        maxWidth: 560,
    },
    pcRight: {
        flex: 1,
        minWidth: 320,
        maxWidth: 440,
        position: 'sticky',
        top: 80,
        alignSelf: 'flex-start',
    },
    pcImageWrapper: {
        width: '100%',
        overflow: 'hidden',
        borderRadius: radius.xl,
        lineHeight: 0,
    },
    pcMainImg: {
        width: '100%',
        height: 'auto',
        display: 'block',
    },

    // 모바일 전용
    mobileImageWrapper: {
        width: '100%',
        overflow: 'hidden',
        marginBottom: 0,
        lineHeight: 0,
        borderRadius: radius.xl,
    },
    imgFavBtn: {
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 5,
    },
};

export default StoreDetail;
