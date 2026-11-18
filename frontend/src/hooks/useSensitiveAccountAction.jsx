import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import useAuthStore from '../store/useAuthStore';
import { assertCurrentSession, currentSession, isCurrentSession } from '../api/sessionScope';
import MfaFlow from '../components/member/MfaFlow';

const cancelled = () => new DOMException('인증을 취소했어요.', 'AbortError');

function requireDeviceFactor(view, factor) {
    if (!factor || view.verified) return;
    const available = { PASSKEY: view.passkeyAvailable, TOTP: !view.passkeyOnly && view.totpAvailable, BACKUP: !view.emailAvailable && !view.passkeyOnly };
    if (!view.verified && !view.enrollmentRequired && available[factor] === true) return;
    const codesRequirePrimary = view.passkeyOnly && factor !== 'PASSKEY';
    throw Object.assign(new Error(codesRequirePrimary
        ? '인증 앱이나 복구코드를 쓰려면 연결한 로그인 수단으로 먼저 본인 확인해주세요.'
        : '선택한 인증 수단을 사용할 수 없어요. 다른 방법으로 확인해주세요.'), { codesRequirePrimary });
}

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
    const run = async (action, password, execute, { factor } = {}) => {
        if (pending.current) throw cancelled();
        const session = currentSession();
        const memberId = useAuthStore.getState().user?.id;
        if (!mounted.current || memberId == null) throw cancelled();
        const trigger = document.activeElement;
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, session.signal]);
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
                signal,
            });
            current();
            let proof = view;
            try {
                requireDeviceFactor(view, factor);
                if (!view.verified) {
                    proof = await new Promise((resolve, reject) => {
                        operation.reject = reject;
                        restoreFocus.current = { element: trigger, epoch: session.epoch, memberId };
                        const initialView = factor && factor !== 'PASSKEY' ? { ...view, preferredFactor: factor } : view;
                        setConfirmation({ view: initialView, action, revision, resolve, reject, startWithPasskey: factor === 'PASSKEY' });
                    });
                }
                if (proof?.verified !== true) throw new Error('본인 확인 결과를 확인하지 못했어요. 인증 수단을 다시 선택해주세요.');
            } catch (failure) {
                // 같은 세션의 인증 요청을 닫고 다음 선택을 받아 새 요청과 겹치지 않게 한다.
                if (action === 'DEVICES' && !signal.aborted && isCurrentSession(session.epoch) && pending.current === operation) {
                    setConfirmation(null);
                    await api.post('/api/auth/mfa/cancel', undefined, { skipAuthRefresh: true, signal, timeout: 2500 }).catch(() => {});
                }
                throw failure;
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
    const panel = active ? <MfaFlow initialView={active.view} startWithPasskey={active.startWithPasskey}
        deviceManagement={active.action === 'DEVICES'} allowRememberBrowser={active.action === 'LINK'} onVerified={result => active.resolve(result)}
        onCancel={() => active.reject(cancelled())} /> : null;
    return { run, panel, confirming: Boolean(active), action: active?.action };
}
