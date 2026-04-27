import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { reservationKeys } from '../../hooks/queryKeys';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { Typography } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { PageContainer, Button } from '../../components/common';
import paymentService from '../../services/paymentService';
import { formatCurrency } from '../../utils';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';

const { Text } = Typography;

const PaymentResult = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    useDocumentTitle('결제 결과');

    const success       = searchParams.get('success') === 'true';
    const merchantUid   = searchParams.get('merchant_uid');
    const impUid        = searchParams.get('imp_uid');
    const errorMsg      = searchParams.get('error_msg');
    const reservationId = searchParams.get('reservation_id');

    const [verifying, setVerifying]       = useState(false);
    const [verified, setVerified]         = useState(false);
    const [verifyError, setVerifyError]   = useState(null);
    const [paymentDetail, setPaymentDetail] = useState(null);
    const [animate, setAnimate]           = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        if (success && impUid && merchantUid && !verified) {
            verifyPayment();
        } else if (success && !impUid) {
            // 이미 검증된 케이스 (usePayment hook에서 직접 navigate)
            setTimeout(() => setAnimate(true), 100);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const verifyPayment = async () => {
        setVerifying(true);
        try {
            const data = await paymentService.verify({
                impUid,
                merchantUid,
                ...(reservationId && { reservationId: Number(reservationId) }),
            });
            setPaymentDetail(data);
            setVerified(true);
            // 결제 성공 → 예약 캐시 무효화 (내 예약 페이지 진입 시 업데이트된 데이터 표시)
            queryClient.invalidateQueries({ queryKey: reservationKeys.my() });
            setTimeout(() => setAnimate(true), 100);
        } catch (err) {
            setVerifyError(typeof err === 'string' ? err : '결제 검증에 실패했습니다.');
        } finally {
            setVerifying(false);
        }
    };

    if (verifying) {
        return (
            <PageContainer size="sm" paddingTop="80px">
                <div style={styles.center}>
                    <LoadingOutlined style={{ fontSize: 40, color: colors.primary.main }} />
                    <Text style={{ marginTop: 20, fontSize: fontSize.lg, color: colors.text.secondary }}>
                        결제 확인 중...
                    </Text>
                </div>
            </PageContainer>
        );
    }

    const isError = !success || verifyError;

    if (isError) {
        return (
            <PageContainer size="sm" paddingTop="40px">
                <div style={styles.wrapper}>
                    <div style={styles.iconWrap}>
                        <div style={{ ...styles.iconCircle, background: colors.error.light }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                                <path d="M18 6L6 18M6 6l12 12" stroke={colors.error.main} strokeWidth="2.5" strokeLinecap="round"/>
                            </svg>
                        </div>
                    </div>

                    <Text style={styles.mainTitle}>결제 실패</Text>
                    <Text style={styles.desc}>{verifyError || errorMsg || '결제 중 오류가 발생했습니다.'}</Text>

                    {merchantUid && (
                        <div style={styles.infoCard}>
                            <div style={styles.infoRow}>
                                <Text style={styles.infoLabel}>주문번호</Text>
                                <Text style={styles.infoValue}>{merchantUid}</Text>
                            </div>
                        </div>
                    )}

                    <div style={styles.btnGroup}>
                        <Button variant="primary" size="lg" block onClick={() => navigate(-1)}>
                            다시 시도하기
                        </Button>
                        <Button variant="secondary" size="lg" block onClick={() => navigate('/my-reservations')}>
                            내 예약 확인
                        </Button>
                    </div>
                </div>
            </PageContainer>
        );
    }

    const detail = paymentDetail;
    const displayMerchantUid = detail?.merchantUid || merchantUid;
    const displayAmount = detail?.amount;
    const displayPayMethod = formatPayMethod(detail?.payMethod);

    return (
        <PageContainer size="sm" paddingTop="40px">
            <div style={styles.wrapper}>
                {/* 성공 아이콘 */}
                <div style={{ ...styles.iconWrap, opacity: animate ? 1 : 0, transform: animate ? 'scale(1)' : 'scale(0.7)', transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
                    <div style={{ ...styles.iconCircle, background: '#e8f9ee' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12l5 5L19 7" stroke={colors.success.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                </div>

                <div style={{ opacity: animate ? 1 : 0, transform: animate ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.35s ease 0.15s' }}>
                    <Text style={styles.mainTitle}>결제 완료</Text>
                    <Text style={styles.desc}>예약금이 정상적으로 결제되었습니다.</Text>
                </div>

                {/* 결제 상세 */}
                <div style={{ ...styles.infoCard, opacity: animate ? 1 : 0, transform: animate ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.35s ease 0.25s' }}>
                    {displayMerchantUid && (
                        <div style={styles.infoRow}>
                            <Text style={styles.infoLabel}>주문번호</Text>
                            <Text style={{ ...styles.infoValue, fontSize: fontSize.xs, color: colors.text.tertiary, fontFamily: 'monospace' }}>
                                {displayMerchantUid}
                            </Text>
                        </div>
                    )}
                    {displayAmount != null && (
                        <>
                            <div style={styles.divider} />
                            <div style={styles.infoRow}>
                                <Text style={styles.infoLabel}>결제금액</Text>
                                <Text style={{ ...styles.infoValue, color: colors.primary.main, fontWeight: fontWeight.bold, fontSize: fontSize.lg }}>
                                    {formatCurrency(displayAmount)}
                                </Text>
                            </div>
                        </>
                    )}
                    {displayPayMethod && (
                        <>
                            <div style={styles.divider} />
                            <div style={styles.infoRow}>
                                <Text style={styles.infoLabel}>결제수단</Text>
                                <Text style={styles.infoValue}>{displayPayMethod}</Text>
                            </div>
                        </>
                    )}
                </div>

                {/* 안내 문구 */}
                <div style={{ ...styles.noticeBox, opacity: animate ? 1 : 0, transition: 'opacity 0.35s ease 0.35s' }}>
                    <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary, lineHeight: 1.6 }}>
                        예약 확정 여부는 가게 승인 후 변경됩니다.{'\n'}
                        취소 시 환불 정책에 따라 처리됩니다.
                    </Text>
                </div>

                {/* 버튼 */}
                <div style={{ ...styles.btnGroup, opacity: animate ? 1 : 0, transform: animate ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.35s ease 0.4s' }}>
                    <Button variant="primary" size="lg" block onClick={() => navigate('/my-reservations', { state: { refetch: true } })}>
                        내 예약 확인하기
                    </Button>
                    <Button variant="secondary" size="lg" block onClick={() => navigate('/stores')}>
                        다른 가게 둘러보기
                    </Button>
                </div>
            </div>
        </PageContainer>
    );
};

// V2 결제수단 포맷
function formatPayMethod(method) {
    if (!method) return null;
    const map = {
        // V2 타입
        PaymentMethodEasyPay:       '간편결제',
        PaymentMethodCard:          '신용/체크카드',
        PaymentMethodTransfer:      '실시간 계좌이체',
        PaymentMethodVirtualAccount:'가상계좌',
        PaymentMethodMobile:        '휴대폰 소액결제',
        // V2 provider
        KakaoPay:  '카카오페이',
        NaverPay:  '네이버페이',
        TossPay:   '토스페이',
        // V1 레거시
        card:      '신용/체크카드',
        vbank:     '가상계좌',
        trans:     '실시간 계좌이체',
        phone:     '휴대폰 소액결제',
        kakaopay:  '카카오페이',
        naverpay:  '네이버페이',
    };
    return map[method] || method;
}

const styles = {
    center: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 12, textAlign: 'center', padding: '80px 20px',
    },
    wrapper: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 20, padding: '40px 20px 60px', textAlign: 'center',
    },
    iconWrap: {
        display: 'flex', justifyContent: 'center',
    },
    iconCircle: {
        width: 72, height: 72, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    mainTitle: {
        display: 'block',
        fontSize: fontSize['5xl'], fontWeight: fontWeight.extrabold,
        color: colors.text.primary, letterSpacing: '-0.5px',
        marginBottom: 6,
    },
    desc: {
        display: 'block',
        fontSize: fontSize.base, color: colors.text.tertiary,
    },
    infoCard: {
        width: '100%', background: colors.gray[50],
        borderRadius: radius.lg, padding: '4px 0',
        border: `1px solid ${colors.border.light}`,
        overflow: 'hidden',
    },
    infoRow: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px',
    },
    infoLabel: {
        fontSize: fontSize.sm, color: colors.text.tertiary,
    },
    infoValue: {
        fontSize: fontSize.sm, color: colors.text.primary,
        fontWeight: fontWeight.semibold,
    },
    divider: {
        height: 1, background: colors.border.light, margin: '0 20px',
    },
    noticeBox: {
        background: colors.gray[50], borderRadius: radius.md,
        padding: '14px 20px', width: '100%',
        border: `1px solid ${colors.border.light}`,
        textAlign: 'left', whiteSpace: 'pre-line',
    },
    btnGroup: {
        display: 'flex', flexDirection: 'column', gap: 8,
        width: '100%', marginTop: 4,
    },
};

export default PaymentResult;
