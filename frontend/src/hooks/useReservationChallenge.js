import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { httpStatusOf } from '../utils/listErrorMessage';

export function reservationChallengeOf(error, requestId) {
    const challenge = error?.data;
    return httpStatusOf(error) === 428 && challenge?.code === 'RESERVATION_CHALLENGE_REQUIRED'
        && challenge.action === 'reservation_submit' && challenge.requestId === requestId
        && typeof challenge.siteKey === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(challenge.siteKey)
        ? challenge : null;
}

export default function useReservationChallenge(scope) {
    const pending = useRef(null);
    const activeScope = useRef(null);
    const [dialog, setDialog] = useState(null);
    const finish = useCallback((request, token, close = true) => {
        if (!request || pending.current !== request) return;
        pending.current = null;
        request.signal.removeEventListener('abort', request.cancel);
        if (close) setDialog(current => current?.request === request ? { ...current, open: false } : current);
        request.resolve(token);
    }, []);
    useLayoutEffect(() => {
        activeScope.current = scope;
        return () => {
            activeScope.current = null;
            finish(pending.current, null, false);
        };
    }, [finish, scope]);

    const solve = (challenge, signal) => new Promise(resolve => {
        if (activeScope.current !== scope || signal.aborted || pending.current) { resolve(null); return; }
        const request = { scope, signal, resolve, cancel: () => finish(request, null) };
        pending.current = request;
        signal.addEventListener('abort', request.cancel, { once: true });
        setDialog({ open: true, challenge, request });
    });
    const current = dialog?.request.scope === scope ? dialog : null;
    return {
        solve,
        dialogProps: current && {
            open: current.open,
            challenge: current.challenge,
            onClose: current.request.cancel,
            onToken: token => finish(current.request, token),
        },
    };
}
