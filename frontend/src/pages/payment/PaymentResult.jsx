import { PageTitle, PageDescription } from '../../components/common/PageTypography';
import LoadingStatus from '../../components/common/LoadingStatus';
import StateIllustration from '../../components/common/StateIllustration';
import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    CheckOutlined, InfoCircleOutlined, WarningOutlined, CalendarOutlined, ClockCircleOutlined,
    CreditCardOutlined, FileTextOutlined, TeamOutlined, UserOutlined, DollarOutlined, UndoOutlined, ShopOutlined,
} from '../../components/common/icons';
import { invalidateAdData, invalidateReservationData } from '../../hooks/invalidateAfterWrite';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import PageContainer from '../../components/common/PageContainer';
import Button from '../../components/common/Button';
import TextLink from '../../components/common/TextLink';
import DetailInfoRows from '../../components/common/DetailInfoRows';
import { SpinIndicator } from '../../components/common/Loading';
import CopyableText from '../../components/common/CopyableText';
import paymentService from '../../services/paymentService';
import useAuthStore from '../../store/useAuthStore';
import { useDocumentEntry } from '../../components/layout/loadingPresentation';
import { consumePaymentReturn } from '../../utils/paymentReturnContext';
import { formatCurrency } from '../../utils';

const FINAL_FAILURE_STATUSES = {
    ad: new Set(['PAYMENT_FAILED', 'CANCELLED']),
    reservation: new Set(['FAILED', 'CANCELLED']),
};
const AD_PAID_STATUSES = new Set(['ACTIVE', 'EXPIRED', 'SUSPENDED']);
const REFUND_STATUSES = new Set(['REFUNDED', 'PARTIAL_REFUNDED']);
const validMerchantUid = value => typeof value === 'string' && Boolean(value.trim()) && value.length <= 255;
const recordsPath = isAd => isAd ? '/business?tab=ads' : '/my-reservations';

function statusCopy({ canLookup, isError, status, confirmed, finalFailure, isAd }) {
    if (!canLookup) return { title: '결제 정보를 확인할 수 없어요',
        description: '결제 내역에서 해당 건을 확인해주세요.', illustration: 'payment-pending' };
    if (isError) return { title: '결제 상태를 불러오지 못했어요',
        description: '서버에서 결제 내역을 확인하지 못했어요. 다시 결제하기 전에 상태를 확인해주세요.', illustration: 'retry' };
    if (confirmed) return { title: '결제 완료', description: isAd ? '광고 결제를 확인했어요.' : '예약금 결제를 확인했어요.', illustration: 'payment-success' };
    if (status === 'REFUNDED') return { title: '환불 완료', description: '결제 취소를 확인했어요. 실제 입금 시점은 결제 수단에 따라 달라요.', illustration: 'payment-success' };
    if (status === 'PARTIAL_REFUNDED') return { title: '부분 환불 완료', description: '결제 금액 중 일부가 환불됐어요.', illustration: 'payment-success' };
    if (status === 'REFUND_PENDING') return { title: '환불 확인 중', description: '환불 요청의 처리 결과를 확인하고 있어요.', illustration: 'payment-pending' };
    if (status === 'REVIEW_REQUIRED') return { title: '결제 내역 확인이 필요해요', description: '같은 결제를 다시 시작하지 말고 결제 내역을 확인해주세요.', illustration: 'payment-pending' };
    if (finalFailure) return { title: '결제가 완료되지 않았어요', description: '결제 내역에서 결제 가능한 상태를 확인해주세요.', illustration: 'payment-failure' };
    return { title: '결제 상태를 확인하고 있어요', description: '아직 결제 결과가 확정되지 않았어요. 확인 중에는 다시 결제하지 마세요.', illustration: 'payment-pending' };
}

/** URL의 성공 문구 대신 본인 주문의 서버 상태만 사용한다. */
const PaymentResult = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    useDocumentTitle('결제 결과');
    const type = searchParams.get('type') || 'reservation';
    const isAd = type === 'ad';
    const merchantUid = searchParams.get('merchant_uid');
    const memberId = useAuthStore(state => state.user?.id);
    const canLookup = Boolean(memberId) && ['ad', 'reservation'].includes(type) && validMerchantUid(merchantUid);
    const checkoutReturn = !isAd && searchParams.get('checkout_return') === 'true';
    const returnResult = useQuery({
        queryKey: ['payment-checkout-return', memberId, merchantUid],
        queryFn: () => paymentService.checkReturn(merchantUid),
        enabled: canLookup && checkoutReturn, retry: false, staleTime: 0, refetchOnMount: 'always',
        refetchOnWindowFocus: false,
    });
    const returnMatches = returnResult.data?.merchantUid === merchantUid && !returnResult.isError
        && ['INCOMPLETE', 'STATUS', 'REVIEW_REQUIRED'].includes(returnResult.data?.outcome);
    const returnReady = returnMatches && !returnResult.isFetching;
    const incomplete = checkoutReturn && returnReady && returnResult.data.outcome === 'INCOMPLETE'
        && Number.isSafeInteger(returnResult.data.storeId) && returnResult.data.storeId > 0;
    const checkingReturn = canLookup && checkoutReturn && (returnResult.isPending || returnResult.isFetching);
    const result = useQuery({
        queryKey: ['payment-result', memberId, type, merchantUid],
        queryFn: () => paymentService.getStatus(type, merchantUid),
        enabled: canLookup && !checkingReturn && !incomplete, retry: false, staleTime: 0, refetchOnMount: 'always',
    });
    const hasMatchingDetail = canLookup && !result.isError && result.data?.type === type && result.data?.merchantUid === merchantUid;
    const detail = hasMatchingDetail ? result.data : undefined;
    const status = checkoutReturn && returnMatches && returnResult.data.outcome === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : detail?.status;
    const confirmed = isAd ? AD_PAID_STATUSES.has(status) : status === 'PAID';
    const finalFailure = Boolean(status) && FINAL_FAILURE_STATUSES[type]?.has(status);
    const refunded = REFUND_STATUSES.has(status);
    const settled = confirmed || finalFailure || refunded;
    const verifying = checkingReturn || incomplete || (canLookup && result.isPending);
    const lookupError = result.isError || (result.isSuccess && !hasMatchingDetail);
    const queryClient = useQueryClient();
    const incompleteNotice = useRef(null);
    const goToRecords = () => navigate(recordsPath(isAd), { replace: true,
        state: { ...(!isAd && { refetch: true }), reserveRouteMotion: 'from-left' } });
    useEffect(() => {
        const notice = memberId + ':' + merchantUid;
        if (!incomplete || incompleteNotice.current === notice) return;
        incompleteNotice.current = notice;
        void invalidateReservationData(queryClient);
        navigate(consumePaymentReturn(merchantUid, memberId, returnResult.data.storeId), { replace: true,
            state: { refetch: true, reserveRouteMotion: 'from-left', paymentIncomplete: { merchantUid, memberId } } });
    }, [incomplete, returnResult.data, merchantUid, memberId, navigate, queryClient]);
    useEffect(() => {
        if (!confirmed && !refunded && !finalFailure) return;
        void (isAd ? invalidateAdData : invalidateReservationData)(queryClient);
    }, [confirmed, refunded, finalFailure, isAd, queryClient]);

    const copy = statusCopy({ canLookup, isError: lookupError, status, confirmed, finalFailure, isAd });
    const canRefresh = canLookup && !settled;
    return <PaymentResultFrame busy={verifying}>
        {verifying ? <PaymentVerifying isAd={isAd} checkoutReturn={checkoutReturn} /> : <section className="reserve-payment-result__content" aria-live="polite">
            <StateIllustration name={copy.illustration} size="lg"
                fallback={confirmed || refunded ? <CheckOutlined /> : finalFailure ? <WarningOutlined /> : <InfoCircleOutlined />}
                interactive={settled || lookupError} />
            <PageTitle level={1} className="reserve-payment-result__title">{copy.title}</PageTitle>
            <PageDescription className="reserve-payment-result__description">{copy.description}</PageDescription>
            <PaymentSummary detail={detail} merchantUid={validMerchantUid(merchantUid) ? merchantUid : null} />
            <div className="reserve-payment-result__actions">
                <Button variant="primary" size="lg" block onClick={goToRecords}>{isAd ? '광고 관리' : '내 예약'}</Button>
                {canRefresh ? <Button variant="secondary" size="lg" block loading={result.isFetching}
                    onClick={() => checkoutReturn ? returnResult.refetch().then(() => result.refetch()) : result.refetch()}>다시 확인</Button>
                    : <Button variant="secondary" size="lg" block onClick={() => navigate('/stores')}>가게 둘러보기</Button>}
            </div>
            {canRefresh && !lookupError && status !== 'REFUND_PENDING' && status !== 'REVIEW_REQUIRED'
                && <PaymentRecoveryLink isAd={isAd} />}
        </section>}
    </PaymentResultFrame>;
};

const PaymentVerifying = ({ isAd, checkoutReturn = false }) => (
        <LoadingStatus as="section" className="reserve-payment-result__content" aria-label="결제 상태를 확인하는 중">
            {checkoutReturn ? <SpinIndicator /> : <StateIllustration name="payment-pending" size="lg" fallback={<SpinIndicator />} />}
            <PageTitle level={1} className="reserve-payment-result__title">결제 처리 중</PageTitle>
            <PageDescription className="reserve-payment-result__description">결제 내역을 확인하고 있어요. 잠시 기다려주세요.</PageDescription>
            {!checkoutReturn && <PaymentRecoveryLink isAd={isAd} />}
        </LoadingStatus>
);
PaymentVerifying.propTypes = { isAd: PropTypes.bool.isRequired, checkoutReturn: PropTypes.bool };

const PaymentResultFrame = ({ children, busy = false }) => {
    const documentEntry = useDocumentEntry();
    return <PageContainer size="sm" paddingTop="56px"
        className={'reserve-payment-result-page' + (documentEntry ? ' reserve-route-entry--from-right' : '')} aria-busy={busy || undefined}>
        <main className="reserve-payment-result">{children}</main>
    </PageContainer>;
};
PaymentResultFrame.propTypes = { children: PropTypes.node.isRequired, busy: PropTypes.bool };

const PaymentRecoveryLink = ({ isAd }) => (
    <p className="reserve-payment-result__recovery">결제창으로 이동하지 못하셨나요?{' '}
        <TextLink to={recordsPath(isAd)} replace state={{ ...(!isAd && { refetch: true }), reserveRouteMotion: 'from-left' }}>
            {isAd ? '광고 관리' : '내 예약'}
        </TextLink>에서 다시 열기
    </p>
);
PaymentRecoveryLink.propTypes = { isAd: PropTypes.bool.isRequired };

const PaymentSummary = ({ detail, merchantUid }) => {
    const reservation = detail?.reservation;
    const rows = [
        reservation?.storeName && { Icon: ShopOutlined, label: '가게', value: reservation.storeName },
        reservation?.reservationCode && { Icon: FileTextOutlined, label: '예약번호', value: <CopyableText value={reservation.reservationCode} label="예약번호" /> },
        reservation?.reservationDate && { Icon: CalendarOutlined, label: '예약 날짜', value: reservation.reservationDate },
        reservation?.reservationTime && { Icon: ClockCircleOutlined, label: '예약 시간', value: reservation.reservationTime.slice(0, 5) },
        reservation?.guestCount != null && { Icon: TeamOutlined, label: '인원', value: reservation.guestCount + '명' },
        reservation?.memberName && { Icon: UserOutlined, label: '예약자', value: reservation.memberName },
        merchantUid && { Icon: FileTextOutlined, label: '주문번호', value: <CopyableText value={merchantUid} label="주문번호" wrap /> },
        detail?.amount != null && { Icon: DollarOutlined, label: '결제 금액', value: formatCurrency(detail.amount), highlight: true },
        detail?.refundedAmount > 0 && { Icon: UndoOutlined, label: '환불 금액', value: formatCurrency(detail.refundedAmount), highlight: true },
        detail?.payMethod && { Icon: CreditCardOutlined, label: '결제 수단', value: formatPayMethod(detail.payMethod, detail.payProvider) },
    ].filter(Boolean);
    if (!rows.length) return null;
    return <section className="reserve-payment-result__summary" aria-label="예약 및 결제 내역">
        <DetailInfoRows rows={rows} />
    </section>;
};
PaymentSummary.propTypes = { detail: PropTypes.object, merchantUid: PropTypes.string };

function formatPayMethod(method, provider) {
    const map = {
        PaymentMethodEasyPay: '간편결제', EasyPay: '간편결제',
        PaymentMethodCard: '카드결제', Card: '카드결제', card: '카드결제',
        PaymentMethodTransfer: '계좌이체', Transfer: '계좌이체', trans: '계좌이체',
        PaymentMethodVirtualAccount: '가상계좌', VirtualAccount: '가상계좌', vbank: '가상계좌',
        PaymentMethodMobile: '휴대폰 결제', Mobile: '휴대폰 결제', phone: '휴대폰 결제',
        KakaoPay: '카카오페이', KAKAOPAY: '카카오페이', kakaopay: '카카오페이',
        NaverPay: '네이버페이', NAVERPAY: '네이버페이', naverpay: '네이버페이',
        TossPay: '토스페이', TOSSPAY: '토스페이', tosspay: '토스페이',
        SAMSUNGPAY: '삼성페이', APPLEPAY: 'Apple Pay',
    };
    if (['PaymentMethodEasyPay', 'EasyPay'].includes(method) && map[provider]) return map[provider];
    return map[method] || '기타 결제';
}
export default PaymentResult;
