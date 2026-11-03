import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/useAuthStore';
import { assertCurrentSession, currentSession, isCurrentSession } from '../api/sessionScope';
import MfaFlow from '../components/member/MfaFlow';

const cancelled = () => new DOMException('인증을 취소했어요.', 'AbortError');

export default function useSensitiveAccountAction() {
    const revision = useAuthStore(state => state.sessionRevision);
    const pending = useRef(null);
    const restoreFocus = useRef(null);
    const mounted = useRef(false);
    const [confirmation, setConfirmation] = useState(null);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; restoreFocus.current = null; pending.current?.controller.abort(); pending.current?.reject(cancelled()); pending.current = null; };
    }, [revision]);
    useEffect(() => {
        if (confirmation || !restoreFocus.current) return;
        const target = restoreFocus.current; restoreFocus.current = null;
        if (mounted.current && isCurrentSession(target.epoch) && useAuthStore.getState().user?.id === target.memberId
            && target.element?.isConnected && document.activeElement === document.body) target.element.focus({ preventScroll: true });
    }, [confirmation, revision]);
    const run = async (action, password, execute) => {
        if (pending.current) throw cancelled();
        const session = currentSession();
        const memberId = useAuthStore.getState().user?.id;
        if (!mounted.current || memberId == null) throw cancelled();
        const trigger = document.activeElement;
        const controller = new AbortController();
        const operation = { controller, reject: () => {} };
        pending.current = operation;
        const current = () => {
            assertCurrentSession(session.epoch);
            controller.signal.throwIfAborted();
            if (!mounted.current || pending.current !== operation || useAuthStore.getState().user?.id !== memberId) throw cancelled();
        };
        try {
            const view = await api.post('/api/member/login-methods/confirm', { action, password }, {
                headers: { 'X-Reserve-Member-Id': String(memberId) }, skipAuthRefresh: true,
                signal: AbortSignal.any([controller.signal, session.signal]),
            });
            current();
            let proof = view;
            if (!view.verified) {
                proof = await new Promise((resolve, reject) => {
                    operation.reject = reject;
                    restoreFocus.current = { element: trigger, epoch: session.epoch, memberId };
                    setConfirmation({ view, action, revision, resolve, reject });
                });
            }
            current();
            setConfirmation(null);
            return await execute({ rememberBrowser: proof.rememberBrowser });
        } finally {
            if (pending.current === operation) {
                pending.current = null;
                if (mounted.current) setConfirmation(null);
            }
        }
    };
    const active = confirmation?.revision === revision ? confirmation : null;
    const panel = active ? <MfaFlow initialView={active.view}
        allowRememberBrowser={active.action === 'LINK'} onVerified={result => active.resolve(result)}
        onCancel={() => active.reject(cancelled())} /> : null;
    return { run, panel, confirming: Boolean(active) };
}
