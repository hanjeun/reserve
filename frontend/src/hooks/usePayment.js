import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PortOne from '@portone/browser-sdk/v2';
import paymentService from '../services/paymentService';
import useMessage from './useMessage';
import usePaymentMethodDialog from './usePaymentMethodDialog';
import useAuthStore from '../store/useAuthStore';
import usePaymentHandoff, { PAYMENT_HANDOFF } from './usePaymentHandoff';
import { configuredPaymentMethods, paymentMethodRequest, paymentWasCancelled } from '../utils/paymentMethods';
import { clearPaymentReturns, rememberPaymentReturn } from '../utils/paymentReturnContext';

const usePayment = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { message } = useMessage();
    const { choosePayment, paymentDialog } = usePaymentMethodDialog();
    const [paying, setPaying] = useState(false);
    const active = useRef(false);
    const attempt = useRef(0);
    useEffect(() => useAuthStore.subscribe((state, before) => {
        if (state.sessionRevision !== before.sessionRevision) {
            clearPaymentReturns(); attempt.current++; active.current = false; setPaying(false);
        }
    }), []);
    const beginHandoff = usePaymentHandoff(order => {
        active.current = false; setPaying(false);
        navigate('/payment/result?checkout_return=true&merchant_uid=' + encodeURIComponent(order.merchantUid));
    });
    const pay = useCallback(async (reservation, buyer) => {
        if (active.current) return { success: false };
        active.current = true;
        const operation = ++attempt.current;
        setPaying(true);
        const revision = useAuthStore.getState().sessionRevision;
        const current = () => revision === useAuthStore.getState().sessionRevision;
        let handedOff = false;
        let checkoutUid = null;
        try {
            if (!configuredPaymentMethods().length) throw new Error('사용 가능한 결제 수단을 불러오지 못했어요.');
            const prepared = await paymentService.prepare({
                reservationId: reservation.id, amount: reservation.depositAmount,
                productName: reservation.storeName + ' 예약금',
                buyerName: buyer.name, buyerEmail: buyer.email, buyerTel: buyer.phone || '',
            });
            if (!current()) return { success: false, stale: true };
            const method = await choosePayment(prepared, { ...reservation, kind: 'RESERVATION' });
            if (!method || !current()) return { success: false, cancelled: true };
            const { merchantUid, storeId, amount, productName, buyerName, buyerEmail, buyerTel } = prepared;
            checkoutUid = merchantUid;
            rememberPaymentReturn(merchantUid, useAuthStore.getState().user?.id, location);
            const payment = await beginHandoff({ merchantUid }, () => PortOne.requestPayment({
                storeId, paymentId: merchantUid, orderName: productName, totalAmount: amount, currency: 'KRW',
                ...paymentMethodRequest(method, prepared),
                customer: { fullName: buyerName, email: buyerEmail, phoneNumber: buyerTel || undefined },
                redirectUrl: window.location.origin + '/api/payment/mobile-redirect',
            })).catch(error => {
                if (paymentWasCancelled(error, method)) return { code: 'PAY_PROCESS_CANCELED' };
                throw error;
            });
            if (payment === PAYMENT_HANDOFF) return { success: false, interrupted: true };
            if (!current()) return { success: false, stale: true };
            if (payment == null) { handedOff = true; beginHandoff({ merchantUid }); return { success: false, redirected: true }; }
            if (payment.code !== undefined) {
                const cancelled = paymentWasCancelled(payment, method);
                navigate('/payment/result?checkout_return=true&merchant_uid=' + encodeURIComponent(merchantUid));
                return { success: false, cancelled };
            }
            if (payment.paymentId !== merchantUid) throw new Error('결제 결과를 확인하지 못했어요. 다시 결제하지 말고 내 예약을 확인해주세요.');
            try {
                // SDK 완료 뒤에도 원장의 주문·금액·상태를 서버에서 확인해요.
                await paymentService.verify({ merchantUid, reservationId: reservation.id });
                if (!current()) return { success: false, stale: true };
                navigate('/payment/result?success=true&merchant_uid=' + encodeURIComponent(merchantUid) + '&reservation_id=' + reservation.id);
                return { success: true };
            } catch {
                if (current()) navigate('/payment/result?success=false&checkout_return=true&merchant_uid=' + encodeURIComponent(merchantUid));
                return { success: false };
            }
        } catch (error) {
            if (current()) {
                if (checkoutUid) navigate('/payment/result?checkout_return=true&merchant_uid=' + encodeURIComponent(checkoutUid));
                else message.error(error instanceof Error ? error.message : '결제를 준비하지 못했어요.');
            }
            return { success: false };
        } finally { if (!handedOff && operation === attempt.current) { active.current = false; setPaying(false); } }
    }, [navigate, location, message, choosePayment, beginHandoff]);
    return { pay, paying, paymentDialog };
};
export default usePayment;
