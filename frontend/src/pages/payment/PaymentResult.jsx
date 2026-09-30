import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    CheckOutlined,
    InfoCircleOutlined,
    LoadingOutlined,
    ReloadOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { invalidateAdData, invalidateReservationData } from '../../hooks/invalidateAfterWrite';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import PageContainer from '../../components/common/PageContainer';
import Button from '../../components/common/Button';
import CopyableText from '../../components/common/CopyableText';
import paymentService from '../../services/paymentService';
import useAuthStore from '../../store/useAuthStore';
import { formatCurrency } from '../../utils';

const FINAL_FAILURE_STATUSES = {
    ad: new Set(['PAYMENT_FAILED', 'CANCELLED']),
    reservation: new Set(['FAILED', 'CANCELLED']),
};

/** URL의 success/error 문구는 증거가 아니다. 본인 DB 기록을 읽고, 이 화면에서는 PG 쓰기를 실행하지 않는다. */
const PaymentResult = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    useDocumentTitle('결제 결과');

    const type = searchParams.get('type') || 'reservation';
    const isAd = type === 'ad';
    const merchantUid = searchParams.get('merchant_uid');
    const memberId = useAuthStore(state => state.user?.id);
    const canLookup = Boolean(memberId)
        && ['ad', 'reservation'].includes(type)
        && Boolean(merchantUid?.trim())
        && merchantUid.length <= 255;
    const result = useQuery({
        queryKey: ['payment-result', memberId, type, merchantUid],
        queryFn: () => paymentService.getStatus(type, merchantUid),
        enabled: canLookup,
        retry: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });
    const paymentDetail = result.data;
    const hasMatchingDetail = canLookup
        && !result.isError
        && paymentDetail?.type === type
        && paymentDetail?.merchantUid === merchantUid;
    const status = hasMatchingDetail ? paymentDetail.status : null;
    const confirmed = status === (isAd ? 'ACTIVE' : 'PAID');
    const finalFailure = Boolean(status) && FINAL_FAILURE_STATUSES[type].has(status);
    const verifying = canLookup && (result.isPending || result.isFetching);
    const queryClient = useQueryClient();
    const goToRecords = () => navigate(
        isAd ? '/business?tab=ads' : '/my-reservations',
        { replace: true, state: isAd ? undefined : { refetch: true } },
    );
    const recoverPayment = () => navigate(
        isAd ? '/business?tab=ads' : '/my-reservations',
        {
            replace: true,
            state: isAd
                ? { reserveRouteMotion: 'from-left' }
                : { refetch: true, reserveRouteMotion: 'from-left' },
        },
    );

    useEffect(() => {
        if (!confirmed) return;
        // 내 목록뿐 아니라 예약 달력의 빈자리·공개 광고·통계도 결제로 바뀐다(invalidateAfterWrite.js).
        (isAd ? invalidateAdData : invalidateReservationData)(queryClient);
    }, [confirmed, isAd, queryClient]);

    if (verifying) {
        return (
            <PaymentResultFrame busy>
                <section className="reserve-payment-result__content" role="status" aria-label="결제 상태를 확인하는 중">
                    <div className="reserve-payment-result__icon reserve-payment-result__icon--progress" aria-hidden="true">
                        <LoadingOutlined spin />
                    </div>
                    <h1 className="reserve-payment-result__title">결제 처리 중</h1>
                    <p className="reserve-payment-result__description">
                        결제 완료 여부를 안전하게 확인하고 있습니다. 화면을 닫거나 같은 결제를 다시 시작하지 마세요.
                    </p>
                    <p className="reserve-payment-result__hint">
                        결제 수단 화면에서 돌아온 뒤에도 확인이 끝날 때까지 잠시 기다려주세요.
                    </p>
                    <PaymentRecoveryLink isAd={isAd} onRecover={recoverPayment} />
                </section>
            </PaymentResultFrame>
        );
    }

    if (confirmed) {
        return (
            <PaymentResultFrame>
                <section className="reserve-payment-result__content">
                    <div className="reserve-payment-result__icon reserve-payment-result__icon--success" aria-hidden="true">
                        <CheckOutlined />
                    </div>
                    <h1 className="reserve-payment-result__title">결제 완료</h1>
                    <p className="reserve-payment-result__description">
                        {isAd ? '광고 등록을 확인했습니다.' : '예약금 결제를 확인했습니다.'}
                    </p>
                    <PaymentSummary detail={paymentDetail} merchantUid={merchantUid} />
                    <p className="reserve-payment-result__hint">
                        {isAd
                            ? '광고 노출 상태와 상세 내역은 광고 관리에서 확인할 수 있습니다.'
                            : '예약 확정 여부와 취소·환불 내역은 내 예약에서 확인할 수 있습니다.'}
                    </p>
                    <div className="reserve-payment-result__actions">
                        <Button variant="primary" size="lg" block onClick={goToRecords}>
                            {isAd ? '내 광고 확인하기' : '내 예약 확인하기'}
                        </Button>
                        {!isAd && (
                            <Button variant="secondary" size="lg" block onClick={() => navigate('/stores')}>
                                다른 가게 둘러보기
                            </Button>
                        )}
                    </div>
                </section>
            </PaymentResultFrame>
        );
    }

    if (finalFailure) {
        return (
            <PaymentResultFrame>
                <section className="reserve-payment-result__content">
                    <div className="reserve-payment-result__icon reserve-payment-result__icon--neutral" aria-hidden="true">
                        <WarningOutlined />
                    </div>
                    <h1 className="reserve-payment-result__title">결제가 완료되지 않았습니다</h1>
                    <p className="reserve-payment-result__description">
                        {isAd
                            ? '광고 관리에서 결제 가능한 상태를 확인한 뒤 다시 진행할 수 있습니다.'
                            : '내 예약에서 결제 가능한 예약을 확인한 뒤 다시 진행할 수 있습니다.'}
                    </p>
                    <PaymentSummary detail={paymentDetail} merchantUid={merchantUid} />
                    <div className="reserve-payment-result__actions">
                        <Button variant="primary" size="lg" block onClick={goToRecords}>
                            {isAd ? '내 광고에서 다시 결제' : '내 예약에서 다시 결제'}
                        </Button>
                    </div>
                </section>
            </PaymentResultFrame>
        );
    }

    let unavailableTitle;
    let unavailableDescription;
    if (!canLookup) {
        unavailableTitle = '결제 정보를 확인할 수 없습니다';
        unavailableDescription = '결제 정보가 충분하지 않습니다. 결제 내역에서 해당 건을 확인해주세요.';
    } else if (result.isError) {
        unavailableTitle = '결제 상태를 불러오지 못했습니다';
        unavailableDescription = '서버에서 결제 내역을 확인하지 못했습니다. 이미 금액이 결제됐다면 다시 결제하지 말고 상태를 다시 확인하세요.';
    } else {
        unavailableTitle = '결제 상태를 확인하고 있어요';
        unavailableDescription = '아직 완료 또는 실패로 확정된 결제가 아닙니다. 상태가 확정될 때까지 같은 결제를 다시 시작하지 마세요.';
    }

    return (
        <PaymentResultFrame>
            <section className="reserve-payment-result__content" aria-live="polite">
                <div className="reserve-payment-result__icon reserve-payment-result__icon--neutral" aria-hidden="true">
                    <InfoCircleOutlined />
                </div>
                <h1 className="reserve-payment-result__title">{unavailableTitle}</h1>
                <p className="reserve-payment-result__description">{unavailableDescription}</p>
                {merchantUid && <PaymentSummary detail={paymentDetail} merchantUid={merchantUid} />}
                {canLookup && !result.isError && <PaymentRecoveryLink isAd={isAd} onRecover={recoverPayment} />}
                <div className="reserve-payment-result__actions">
                    {canLookup && (
                        <Button
                            variant="outline"
                            size="lg"
                            block
                            icon={<ReloadOutlined aria-hidden="true" />}
                            loadingIcon={<ReloadOutlined spin aria-hidden="true" />}
                            loading={result.isFetching}
                            onClick={() => result.refetch?.()}
                        >
                            상태 다시 확인
                        </Button>
                    )}
                    <Button variant={canLookup ? 'secondary' : 'primary'} size="lg" block onClick={goToRecords}>
                        {isAd ? '내 광고 확인하기' : '내 예약 확인'}
                    </Button>
                </div>
            </section>
        </PaymentResultFrame>
    );
};

const PaymentResultFrame = ({ children, busy = false }) => (
    <PageContainer size="sm" paddingTop="56px" className="reserve-payment-result-page" aria-busy={busy || undefined}>
        <main className="reserve-payment-result">{children}</main>
    </PageContainer>
);

const PaymentRecoveryLink = ({ isAd, onRecover }) => (
    <p className="reserve-payment-result__recovery">
        결제창으로 이동하지 못하셨나요?{' '}
        <button type="button" onClick={onRecover}>
            {isAd ? '광고 관리에서 다시 열기' : '내 예약에서 다시 열기'}
        </button>
    </p>
);

const PaymentSummary = ({ detail, merchantUid }) => {
    const displayMerchantUid = detail?.merchantUid || merchantUid;
    const displayPayMethod = formatPayMethod(detail?.payMethod);
    const rows = [
        displayMerchantUid && { label: '주문번호', value: displayMerchantUid, muted: true, copyable: true },
        detail?.amount != null && { label: '결제금액', value: formatCurrency(detail.amount), strong: true },
        displayPayMethod && { label: '결제수단', value: displayPayMethod },
    ].filter(Boolean);

    if (rows.length === 0) return null;

    return (
        <dl className="reserve-payment-result__summary">
            {rows.map(({ label, value, muted, strong, copyable }) => (
                <div className="reserve-payment-result__summary-row" key={label}>
                    <dt>{label}</dt>
                    <dd className={[
                        muted && 'reserve-payment-result__summary-value--muted',
                        strong && 'reserve-payment-result__summary-value--strong',
                    ].filter(Boolean).join(' ')}
                    >
                        {copyable ? <CopyableText value={value} label={label} /> : value}
                    </dd>
                </div>
            ))}
        </dl>
    );
};

PaymentRecoveryLink.propTypes = {
    isAd: PropTypes.bool.isRequired,
    onRecover: PropTypes.func.isRequired,
};

// PortOne V2와 이전 V1 기록을 함께 읽는다.
function formatPayMethod(method) {
    if (!method) return null;
    const map = {
        PaymentMethodEasyPay: '간편결제',
        PaymentMethodCard: '신용/체크카드',
        PaymentMethodTransfer: '실시간 계좌이체',
        PaymentMethodVirtualAccount: '가상계좌',
        PaymentMethodMobile: '휴대폰 소액결제',
        KakaoPay: '카카오페이',
        NaverPay: '네이버페이',
        TossPay: '토스페이',
        card: '신용/체크카드',
        vbank: '가상계좌',
        trans: '실시간 계좌이체',
        phone: '휴대폰 소액결제',
        kakaopay: '카카오페이',
        naverpay: '네이버페이',
    };
    return map[method] || method;
}

export default PaymentResult;
