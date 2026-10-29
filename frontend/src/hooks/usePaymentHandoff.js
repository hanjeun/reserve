import { useEffect, useEffectEvent, useRef } from 'react';
import useAuthStore from '../store/useAuthStore';

export const PAYMENT_HANDOFF = Symbol('payment-handoff');

/** SDK 응답과 실제 창 수명을 함께 확인하며 미확정 주문은 결과 조회로만 넘겨요. */
export default function usePaymentHandoff(onReturn) {
    const revision = useAuthStore(state => state.sessionRevision);
    const current = useRef(null);
    const recoverRef = useRef(null);
    const returned = useEffectEvent(order => onReturn(order));
    useEffect(() => {
        const recover = () => {
            const order = current.current;
            if (!order || order.revision !== useAuthStore.getState().sessionRevision || document.visibilityState === 'hidden') return;
            // 인증 중인 프레임이나 팝업으로 나간 사용자를 시간만으로 중단하지 않아요.
            if (order.frame?.isConnected || order.away && !document.hasFocus()) return;
            current.current = null;
            order.dispose();
            order.resolve?.(PAYMENT_HANDOFF);
            returned(order);
        };
        recoverRef.current = recover;
        const away = () => { if (current.current) current.current.away = true; };
        const visible = () => {
            if (document.visibilityState === 'hidden') away();
            else if (current.current?.away) { current.current.away = false; recover(); }
        };
        const focus = () => { if (current.current?.away) { current.current.away = false; recover(); } };
        const shown = event => { if (event.persisted) recover(); };
        document.addEventListener('visibilitychange', visible);
        window.addEventListener('blur', away);
        window.addEventListener('focus', focus);
        window.addEventListener('pageshow', shown);
        return () => {
            const order = current.current;
            current.current = null;
            recoverRef.current = null;
            order?.dispose();
            order?.resolve?.(PAYMENT_HANDOFF);
            document.removeEventListener('visibilitychange', visible);
            window.removeEventListener('blur', away);
            window.removeEventListener('focus', focus);
            window.removeEventListener('pageshow', shown);
        };
    }, [revision]);
    return (order, request) => {
        const previous = current.current;
        previous?.dispose();
        previous?.resolve?.(PAYMENT_HANDOFF);
        const value = { ...order, revision: useAuthStore.getState().sessionRevision,
            away: document.visibilityState === 'hidden', frame: null };
        const priorFrame = document.getElementById('imp-iframe');
        let observer;
        let closeTimer;
        const timer = setTimeout(() => recoverRef.current?.(), 10_000);
        value.dispose = () => { clearTimeout(timer); clearTimeout(closeTimer); observer?.disconnect(); };
        current.current = value;
        if (!request) return undefined;
        return new Promise((resolve, reject) => {
            value.resolve = resolve;
            const inspect = () => {
                if (current.current !== value) return;
                // PortOne 최상위 프레임만 관찰하고 외부 카드사 문서에는 접근하지 않아요.
                const frame = document.getElementById('imp-iframe');
                if (frame && frame !== priorFrame) { value.frame = frame; clearTimeout(closeTimer); closeTimer = null; }
                else if (value.frame && !value.frame.isConnected && !closeTimer)
                    closeTimer = setTimeout(() => recoverRef.current?.(), 300);
            };
            observer = new MutationObserver(inspect);
            observer.observe(document.body, { childList: true, subtree: true });
            inspect();
            Promise.resolve().then(() => current.current === value ? request() : PAYMENT_HANDOFF).then(response => {
                if (current.current !== value) return;
                current.current = null; value.dispose(); resolve(response);
            }, error => {
                if (current.current !== value) return;
                current.current = null; value.dispose(); reject(error);
            });
        });
    };
}
