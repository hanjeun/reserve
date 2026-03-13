import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Empty, Typography } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, TeamOutlined, UserOutlined, CreditCardOutlined } from '@ant-design/icons';
import { PageContainer, Button } from '../../components/common';
import { MyReservationCardSkeleton } from '../../components/common';
import ReservationStatusBadge from '../../components/reservation/ReservationStatusBadge';
import { useReservations, useMessage, usePayment } from '../../hooks';
import useAuthStore from '../../store/useAuthStore';
import paymentService from '../../services/paymentService';
import { formatTime, formatCurrency, getThumbnailUrl } from '../../utils';
import { colors, radius, fontWeight, fontSize } from '../../styles/tokens';

const { Title, Text } = Typography;

const useIsWide = () => {
    const [wide, setWide] = React.useState(() => window.innerWidth >= 576);
    React.useEffect(() => {
        const handler = () => setWide(window.innerWidth >= 576);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    return wide;
};

const MyReservations = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { message, confirm } = useMessage();
    const { reservations, loading, cancelReservation, refetch } = useReservations();
    const { user } = useAuthStore();
    const { pay, paying } = usePayment();
    const isWide = useIsWide();

    useEffect(() => {
        refetch();
        if (location.state?.warnMsg) {
            message.warning({ content: location.state.warnMsg, key: 'review_warn' });
        }
        if (location.state?.refetch) {
            refetch();
        }
        if (location.state) {
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handlePay = async (res) => {
        await pay(
            { id: res.id, storeName: res.storeName, depositAmount: res.depositAmount },
            { name: user?.name, email: user?.email, phone: user?.phone }
        );
    };

    const handleCancel = async (res) => {
        let content = '예약을 취소하시겠습니까? 취소 후 되돌릴 수 없습니다.';

        if (res.depositPaid) {
            try {
                const preview = await paymentService.getRefundPreview(res.id);
                if (preview.refundAmount > 0) {
                    content = `예약을 취소하면 ${formatCurrency(preview.refundAmount)}이 환불됩니다. (${preview.reason})`;
                } else {
                    content = `취소 시점 기준 환불 불가 조건입니다. (${preview.reason}) 예약을 취소하시겠습니까?`;
                }
            } catch {
                // 환불 조회 실패해도 취소는 계속 진행
            }
        }

        confirm({
            title: '예약 취소',
            content,
            okText: '취소하기', cancelText: '닫기',
            okButtonProps: { danger: true }, centered: true,
            onOk: () => cancelReservation(res.id),
        });
    };

    return (
        <PageContainer size="xl" paddingTop="40px">
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={styles.title}>내 예약 확인</Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    예약 현황을 확인하고 방문 후 리뷰를 남겨보세요
                </Text>
            </div>

            {loading ? (
                <MyReservationCardSkeleton count={4} />
            ) : reservations.length === 0 ? (
                <div style={{ marginTop: 100 }}>
                    <Empty description="예약 내역이 없습니다." />
                </div>
            ) : (
                <div>
                    {reservations.map((res, i) => (
                        <React.Fragment key={res.id}>
                            <div style={styles.row}>
                                {/* 이미지 */}
                                <div
                                    style={isWide ? styles.imgWrapWide : styles.imgWrap}
                                    onClick={() => navigate(`/store/${res.storeId}`)}
                                >
                                    <img src={getThumbnailUrl(res.storeMainImageUrl)} alt={res.storeName} style={styles.img} />
                                </div>

                                {/* 정보 */}
                                <div style={styles.info} onClick={() => navigate(`/store/${res.storeId}`)}>
                                    <Text strong style={isWide ? styles.storeNameWide : styles.storeName}>
                                        {res.storeName}
                                    </Text>

                                    {isWide ? (
                                        /* PC: 한 줄 */
                                        <div style={styles.metaRowFlat}>
                                            <span style={styles.metaItem}><UserOutlined style={styles.metaIcon} />{res.memberName}</span>
                                            <span style={styles.dot}>·</span>
                                            <span style={styles.metaItem}><TeamOutlined style={styles.metaIcon} />{res.guestCount}명</span>
                                            <span style={styles.dot}>·</span>
                                            <span style={styles.metaItem}><CalendarOutlined style={styles.metaIcon} />{res.reservationDate}</span>
                                            <span style={styles.dot}>·</span>
                                            <span style={styles.metaItem}><ClockCircleOutlined style={styles.metaIcon} />{formatTime(res.reservationTime)}</span>
                                        </div>
                                    ) : (
                                        /* 모바일: 2줄 */
                                        <>
                                            <div style={styles.metaRow}>
                                                <span style={styles.metaItem}><UserOutlined style={styles.metaIcon} />{res.memberName}</span>
                                                <span style={styles.dot}>·</span>
                                                <span style={styles.metaItem}><TeamOutlined style={styles.metaIcon} />{res.guestCount}명</span>
                                            </div>
                                            <div style={styles.metaRow}>
                                                <span style={styles.metaItem}><CalendarOutlined style={styles.metaIcon} />{res.reservationDate}</span>
                                                <span style={styles.dot}>·</span>
                                                <span style={styles.metaItem}><ClockCircleOutlined style={styles.metaIcon} />{formatTime(res.reservationTime)}</span>
                                            </div>
                                        </>
                                    )}

                                    {res.specialRequest && (
                                        <div style={styles.metaRow}>
                                            <Text type="secondary" style={{ ...styles.special, maxWidth: isWide ? 400 : 200 }} ellipsis={{ tooltip: res.specialRequest }}>
                                                &quot;{res.specialRequest}&quot;
                                            </Text>
                                        </div>
                                    )}
                                </div>

                                {/* 우측: 상태 + 금액 + 버튼 */}
                                <div style={styles.right}>
                                    <ReservationStatusBadge status={res.status} />
                                    <Text strong style={styles.price}>{formatCurrency(res.depositAmount)}</Text>

                                    {res.status === 'PENDING' && res.depositAmount > 0 && !res.depositPaid && (
                                        <Button
                                            variant="ghost-sm-primary"
                                            loading={paying}
                                            onClick={(e) => { e.stopPropagation(); handlePay(res); }}
                                        >
                                            <CreditCardOutlined /> 결제하기
                                        </Button>
                                    )}

                                    {(res.status === 'PENDING' || res.status === 'CONFIRMED') && (
                                        <Button
                                            variant="ghost-sm-danger"
                                            onClick={(e) => { e.stopPropagation(); handleCancel(res); }}
                                        >
                                            취소
                                        </Button>
                                    )}
                                    {res.status === 'COMPLETED' && (
                                        res.reviewId
                                            ? <Button
                                                variant="ghost-sm-success"
                                                onClick={(e) => { e.stopPropagation(); navigate(`/store/${res.storeId}`, { state: { openReviewId: res.reviewId } }); }}
                                              >
                                                리뷰 보기
                                              </Button>
                                            : <Button
                                                variant="ghost-sm-primary"
                                                onClick={(e) => { e.stopPropagation(); navigate(`/store/${res.storeId}`, { state: { openWrite: true } }); }}
                                              >
                                                리뷰 쓰기
                                              </Button>
                                    )}

                                    {res.status === 'REJECTED' && res.rejectionReason && (
                                        <Text type="secondary" style={styles.rejection}>
                                            사유: {res.rejectionReason}
                                        </Text>
                                    )}
                                </div>
                            </div>
                            {i < reservations.length - 1 && <div style={styles.divider} />}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </PageContainer>
    );
};

const styles = {
    title:         { fontWeight: fontWeight.extrabold, margin: '0 0 8px', color: colors.text.primary },
    row:           { display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0', cursor: 'pointer' },
    divider:       { height: 1, background: colors.border?.light || '#f0f0f0' },
    imgWrap:       { width: 60, height: 60, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 },
    imgWrapWide:   { width: 72, height: 72, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 },
    img:           { width: '100%', height: '100%', objectFit: 'cover' },
    info:          { flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 },
    storeName:     { fontSize: fontSize.base, color: colors.text.primary, display: 'block', lineHeight: 1.3 },
    storeNameWide: { fontSize: fontSize.lg, color: colors.text.primary, display: 'block', lineHeight: 1.3, fontWeight: fontWeight.semibold },
    metaRow:       { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' },
    metaRowFlat:   { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    metaItem:      { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fontSize.sm, color: colors.text.secondary, whiteSpace: 'nowrap' },
    metaIcon:      { fontSize: 12, color: colors.text.tertiary },
    dot:           { color: colors.text.tertiary, fontSize: fontSize.xs },
    special:       { fontSize: fontSize.xs, color: colors.text.secondary },
    right:         { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, minWidth: 70 },
    price:         { fontSize: fontSize.base, color: colors.text.primary },
    rejection:     { fontSize: fontSize.xs, textAlign: 'left', width: '100%' },
};

export default MyReservations;
