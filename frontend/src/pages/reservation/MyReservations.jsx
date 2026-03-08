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

const MyReservations = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { message, confirm } = useMessage();
    const { reservations, loading, cancelReservation, refetch } = useReservations();
    const { user } = useAuthStore();
    const { pay, paying } = usePayment();

    useEffect(() => {
        refetch();
        if (location.state?.warnMsg) {
            message.warning({ content: location.state.warnMsg, key: 'review_warn' });
        }
        // 결제 완료 후 네비게이트 시 refetch 플래그
        if (location.state?.refetch) {
            refetch();
        }
        // state 정리 (다시 마운트 시 중복 실행 방지)
        if (location.state) {
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 결제하기 (PENDING + 미결제)
    const handlePay = async (res) => {
        await pay(
            { id: res.id, storeName: res.storeName, depositAmount: res.depositAmount },
            { name: user?.name, email: user?.email, phone: user?.phone }
        );
    };

    // 취소 (depositPaid 여부에 따라 환불 안내 포함)
    const handleCancel = async (res) => {
        let content = '예약을 취소하시겠습니까? 취소 후 되돌릴 수 없습니다.';

        // 예약금 결제 완료된 경우 환불 예상액 조회
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
                                <div style={styles.imgWrap} onClick={() => navigate(`/store/${res.storeId}`)}>
                                    <img src={getThumbnailUrl(res.storeMainImageUrl)} alt={res.storeName} style={styles.img} />
                                </div>

                                {/* 정보 */}
                                <div style={styles.info} onClick={() => navigate(`/store/${res.storeId}`)}>
                                    <Text strong style={styles.storeName}>{res.storeName}</Text>
                                    <div style={styles.meta}>
                                        <span style={styles.metaItem}>
                                            <UserOutlined style={styles.metaIcon} />{res.memberName}
                                        </span>
                                        <span style={styles.dot}>·</span>
                                        <span style={styles.metaItem}><CalendarOutlined style={styles.metaIcon} />{res.reservationDate}</span>
                                        <span style={styles.dot}>·</span>
                                        <span style={styles.metaItem}><ClockCircleOutlined style={styles.metaIcon} />{formatTime(res.reservationTime)}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                        <span style={styles.guest}>
                                            <TeamOutlined style={{ marginRight: 3, fontSize: 11 }} />{res.guestCount}명
                                        </span>
                                        {res.specialRequest && (
                                            <Text type="secondary" style={styles.special} ellipsis={{ tooltip: res.specialRequest }}>
                                                &quot;{res.specialRequest}&quot;
                                            </Text>
                                        )}
                                    </div>
                                </div>

                                {/* 우측: 상태 + 금액 + ghost-sm 버튼 */}
                                <div style={styles.right}>
                                    <ReservationStatusBadge status={res.status} />
                                    <Text strong style={styles.price}>{formatCurrency(res.depositAmount)}</Text>

                                    {/* PENDING + 미결제 → 결제하기 버튼 */}
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
    title:    { fontWeight: fontWeight.extrabold, margin: '0 0 8px', color: colors.text.primary },
    row:      { display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0', cursor: 'pointer' },
    divider:  { height: 1, background: colors.border?.light || '#f0f0f0' },
    imgWrap:  { width: 60, height: 60, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 },
    img:      { width: '100%', height: '100%', objectFit: 'cover' },
    info:     { flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
    storeName:{ fontSize: fontSize.base, color: colors.text.primary, display: 'block', lineHeight: 1.3 },
    meta:     { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2 },
    metaItem: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fontSize.xs, color: colors.text.secondary },
    metaIcon: { fontSize: 11, color: colors.text.tertiary },
    dot:      { color: colors.text.tertiary, fontSize: fontSize.xs },
    guest:    { fontSize: fontSize.xs, color: colors.text.secondary, display: 'inline-flex', alignItems: 'center' },
    special:  { fontSize: fontSize.xs, color: colors.text.secondary, maxWidth: 180 },
    right:    { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, minWidth: 70 },
    price:    { fontSize: fontSize.base, color: colors.text.primary },
};

export default MyReservations;
