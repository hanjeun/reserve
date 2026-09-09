import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adKeys, reservationKeys } from '../../hooks/queryKeys';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { Typography } from 'antd';
import { PageContainer, Button, Loading } from '../../components/common';
import paymentService from '../../services/paymentService';
import useAuthStore from '../../store/useAuthStore';
import { formatCurrency } from '../../utils';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';

const { Text } = Typography;

/** URL의 success/error 문구는 증거가 아니다. 본인 DB 기록을 읽고, 이 화면에서는 PG 쓰기를 실행하지 않는다. */
const PaymentResult = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    useDocumentTitle('결제 결과');

    const type = searchParams.get('type') || 'reservation';
    const isAd = type === 'ad';
    const merchantUid = searchParams.get('merchant_uid');
    const memberId = useAuthStore(state => state.user?.id);
    const canLookup = Boolean(memberId) && ['ad', 'reservation'].includes(type) && Boolean(merchantUid?.trim()) && merchantUid.length <= 255;
    const result = useQuery({
        queryKey: ['payment-result', memberId, type, merchantUid],
        queryFn: () => paymentService.getStatus(type, merchantUid),
        enabled: canLookup,
        retry: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });
    const paymentDetail = result.data;
    const confirmed = canLookup && !result.isError && paymentDetail?.type === type
        && paymentDetail?.merchantUid === merchantUid
        && paymentDetail?.status === (isAd ? 'ACTIVE' : 'PAID');
    const verifying = canLookup && (result.isPending || result.isFetching);
    const goToRecords = () => navigate(isAd ? '/business?tab=ads' : '/my-reservations', { replace: true });
    const [animate, setAnimate] = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!confirmed) return;
        queryClient.invalidateQueries({ queryKey: isAd ? adKeys.my() : reservationKeys.my() });
        const timer = setTimeout(() => setAnimate(true), 100);
        return () => clearTimeout(timer);
    }, [confirmed, isAd, queryClient]);

    if (verifying) {
        return (
            <PageContainer size="sm" paddingTop="80px">
                <div style={styles.center}>
                    <Loading />
                    <Text style={{ marginTop: 20, fontSize: fontSize.lg, color: colors.text.secondary }}>
                        결제 확인 중...
                    </Text>
                </div>
            </PageContainer>
        );
    }

    if (!confirmed) {
        return (
            <PageContainer size="sm" paddingTop="40px">
                <div style={styles.wrapper}>
                    <div style={styles.iconWrap}>
                        <div style={{ ...styles.iconCircle, background: colors.warning.light }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                                <path d="M12 5v9m0 4v1" stroke={colors.warning.main} strokeWidth="2.5" strokeLinecap="round"/>
                            </svg>
                        </div>
                    </div>

                    <Text style={styles.mainTitle}>결제 상태 확인</Text>
                    <Text style={styles.desc}>
                        {result.isError ? '서버에서 결제 내역을 확인하지 못했습니다. 로그인 상태와 내역을 확인해주세요.'
                            : '현재 완료된 결제로 확인되지 않습니다. 결제·취소·환불 내역을 확인해주세요.'}
                        {' '}이미 금액이 결제됐다면 다시 결제하지 마세요.
                    </Text>

                    {merchantUid && (
                        <div style={styles.infoCard}>
                            <div style={styles.infoRow}>
                                <Text style={styles.infoLabel}>주문번호</Text>
                                <Text style={styles.infoValue}>{merchantUid}</Text>
                            </div>
                        </div>
                    )}

                    <div style={styles.btnGroup}>
                        {canLookup && (
                            <Button variant="primary" size="lg" block onClick={() => result.refetch()}>
                                상태 다시 확인
                            </Button>
                        )}
                        <Button variant="secondary" size="lg" block onClick={goToRecords}>
                            {isAd ? '내 광고 확인하기' : '내 예약 확인'}
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
                    <div style={{ ...styles.iconCircle, background: colors.success.light }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12l5 5L19 7" stroke={colors.success.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                </div>

                <div style={{ opacity: animate ? 1 : 0, transform: animate ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.35s ease 0.15s' }}>
                    <Text style={styles.mainTitle}>결제 완료</Text>
                    <Text style={styles.desc}>
                        {isAd ? '광고가 등록되었습니다.' : '예약금이 정상적으로 결제되었습니다.'}
                    </Text>
                </div>

                {/* 서버 기록으로 확인한 결제 상세 */}
                <div style={{ ...styles.infoCard, opacity: animate ? 1 : 0, transform: animate ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.35s ease 0.25s' }}>
                    {displayMerchantUid && (
                        <div style={styles.infoRow}>
                            <Text style={styles.infoLabel}>주문번호</Text>
                            <Text style={{ ...styles.infoValue, fontSize: fontSize.xs, color: colors.text.tertiary }}>
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
                        {isAd
                            ? '광고는 설정한 노출 기간과 가게 운영 상태에 따라 표시됩니다.'
                            : <>예약 확정 여부는 가게 승인 후 변경됩니다.{'\n'}취소 시 환불 정책에 따라 처리됩니다.</>
                        }
                    </Text>
                </div>

                {/* 버튼 */}
                <div style={{ ...styles.btnGroup, opacity: animate ? 1 : 0, transform: animate ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.35s ease 0.4s' }}>
                    {isAd ? (
                        <Button variant="primary" size="lg" block onClick={goToRecords}>
                            내 광고 확인하기
                        </Button>
                    ) : (
                        <>
                            <Button variant="primary" size="lg" block onClick={() => navigate('/my-reservations', { state: { refetch: true } })}>
                                내 예약 확인하기
                            </Button>
                            <Button variant="secondary" size="lg" block onClick={() => navigate('/stores')}>
                                다른 가게 둘러보기
                            </Button>
                        </>
                    )}
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
