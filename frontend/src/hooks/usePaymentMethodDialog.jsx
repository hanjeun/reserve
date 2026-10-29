import { useCallback, useEffect, useRef, useState } from 'react';
import PaymentMethodDialog from '../components/payment/PaymentMethodDialog';
import useAuthStore from '../store/useAuthStore';
import { configuredPaymentMethods } from '../utils/paymentMethods';

export default function usePaymentMethodDialog() {
    const revision = useAuthStore(state => state.sessionRevision);
    const [dialog, setDialog] = useState(null);
    const pending = useRef(null);
    const sequence = useRef(0);
    useEffect(() => () => { pending.current?.resolve(null); pending.current = null; }, [revision]);
    const choosePayment = useCallback((prepared, summary = {}) => {
        const methods = configuredPaymentMethods(import.meta.env, prepared);
        if (!methods.length) throw new Error('사용 가능한 결제 수단을 불러오지 못했어요.');
        if (!prepared.storeId || !prepared.merchantUid || !Number.isSafeInteger(prepared.amount) || prepared.amount <= 0)
            throw new Error('결제 금액과 주문 정보를 확인하지 못했어요.');
        if (pending.current) throw new Error('이미 결제를 준비하고 있어요.');
        return new Promise(resolve => {
            const current = useAuthStore.getState().sessionRevision;
            const id = ++sequence.current;
            pending.current = { resolve, revision: current, id };
            setDialog({ prepared, summary, methods, selectedId: methods[0].id, revision: current, id, open: true });
        });
    }, []);
    const settle = useCallback(method => {
        const active = pending.current;
        if (!active || active.closing) return;
        active.closing = true;
        active.method = method;
        setDialog(current => current ? { ...current, open: false } : null);
    }, []);
    const closed = useCallback(id => {
        const active = pending.current;
        if (active?.id === id) {
            pending.current = null;
            active.resolve(active.revision === useAuthStore.getState().sessionRevision ? active.method : null);
        }
        setDialog(current => current?.id === id && !current.open ? null : current);
    }, []);
    const paymentDialog = dialog && dialog.revision === revision ? <PaymentMethodDialog
        {...dialog} onChange={selectedId => setDialog(current => current?.methods.some(method => method.id === selectedId) ? { ...current, selectedId } : current)}
        onConfirm={method => settle(method)} onClose={() => settle(null)} afterClose={() => closed(dialog.id)}
    /> : null;
    return { choosePayment, paymentDialog };
}
