import { useCallback, useRef, useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import usePaymentHandoff, { PAYMENT_HANDOFF } from './usePaymentHandoff';
import PortOne from '@portone/browser-sdk/v2';
import adService from '../services/adService';
import useMessage from './useMessage';
import usePaymentMethodDialog from './usePaymentMethodDialog';
import useAuthStore from '../store/useAuthStore';
import { configuredPaymentMethods, paymentMethodRequest, paymentWasCancelled } from '../utils/paymentMethods';
import { invalidateAdData } from './invalidateAfterWrite';

const useAdPayment = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const { choosePayment, paymentDialog } = usePaymentMethodDialog();
    const active = useRef(false);
    const attempt = useRef(0);
    const [handoff, setHandoff] = useState(null);
    const navigate = useNavigate();
    const beginHandoff = usePaymentHandoff(order => {
        active.current = false; setHandoff(null);
        navigate('/payment/result?type=ad&merchant_uid=' + encodeURIComponent(order.merchantUid));
    });
    const runPayment = useCallback(async (prepared, origin) => {
        const revision = useAuthStore.getState().sessionRevision;
        const current = () => revision === useAuthStore.getState().sessionRevision;
        const method = await choosePayment(prepared, { kind: 'ADVERTISEMENT' });
        if (!method || !current()) return { success: false, cancelled: true };
        const { merchantUid, storeId, amount, productName, buyerName, buyerEmail, buyerTel } = prepared;
        const payment = await beginHandoff({ merchantUid }, () => PortOne.requestPayment({
            storeId, paymentId: merchantUid, orderName: productName, totalAmount: amount, currency: 'KRW',
            ...paymentMethodRequest(method, prepared),
            customer: { fullName: buyerName, email: buyerEmail, phoneNumber: buyerTel || undefined },
            redirectUrl: window.location.origin + '/api/advertisements/mobile-redirect',
        })).catch(error => {
            if (paymentWasCancelled(error, method)) return { code: 'PAY_PROCESS_CANCELED' };
            throw error;
        });
        if (payment === PAYMENT_HANDOFF) return { success: false, interrupted: true };
        if (!current()) return { success: false, stale: true };
        if (payment == null) { setHandoff(origin); beginHandoff({ merchantUid }); return { success: false, redirected: true }; }
        if (payment.code !== undefined) {
            const cancelled = paymentWasCancelled(payment, method);
            if (cancelled) navigate('/payment/result?type=ad&merchant_uid=' + encodeURIComponent(merchantUid));
            else message.error(payment.message || '결제에 실패했어요.');
            return { success: false, cancelled };
        }
        if (payment.paymentId !== merchantUid) throw new Error('결제 결과를 확인하지 못했어요. 다시 결제하지 말고 광고 내역을 확인해주세요.');
        const ad = await adService.verifyPayment(merchantUid);
        if (!current()) return { success: false, stale: true };
        message.success('광고가 등록됐어요.');
        return { success: true, ad };
    }, [message, navigate, choosePayment, beginHandoff]);
    const operate = async (prepare, origin) => {
        if (active.current) return { success: false };
        active.current = true;
        const operation = ++attempt.current;
        const revision = useAuthStore.getState().sessionRevision;
        let handedOff = false;
        try {
            if (!configuredPaymentMethods().length) throw new Error('사용 가능한 결제 수단을 불러오지 못했어요.');
            const prepared = await prepare();
            if (revision !== useAuthStore.getState().sessionRevision) return { success: false, stale: true };
            const result = await runPayment(prepared, origin);
            handedOff = Boolean(result.redirected);
            return result;
        } catch (error) {
            if (revision === useAuthStore.getState().sessionRevision) message.error(error instanceof Error ? error.message : '결제 결과를 확인하지 못했어요.');
            return { success: false };
        } finally { if (!handedOff && operation === attempt.current) active.current = false; }
    };
    const invalidateMyAds = useCallback(() => { void invalidateAdData(queryClient); }, [queryClient]);
    const createMutation = useMutation({ mutationFn: formData => operate(() => adService.createAd(formData), { kind: 'create' }), onSuccess: invalidateMyAds });
    const payExistingMutation = useMutation({ mutationFn: adId => operate(() => adService.preparePayment(adId), { kind: 'existing', id: adId }), onSuccess: invalidateMyAds });
    const resetCreate = createMutation.reset;
    const resetExisting = payExistingMutation.reset;
    useEffect(() => useAuthStore.subscribe((state, before) => {
        if (state.sessionRevision !== before.sessionRevision) {
            attempt.current++; active.current = false; setHandoff(null); resetCreate(); resetExisting();
        }
    }), [resetCreate, resetExisting]);
    return { pay: createMutation.mutateAsync, payExisting: payExistingMutation.mutateAsync,
        paying: createMutation.isPending || handoff?.kind === 'create',
        payingId: payExistingMutation.isPending ? payExistingMutation.variables : handoff?.kind === 'existing' ? handoff.id : null, paymentDialog };
};
export default useAdPayment;
