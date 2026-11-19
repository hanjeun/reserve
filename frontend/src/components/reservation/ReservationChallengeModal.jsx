import { useEffect, useEffectEvent, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '../common/Button';
import ResponsiveModal from '../common/ResponsiveModal';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoad;

function loadTurnstile() {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);
    scriptLoad ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        const fail = () => {
            clearTimeout(timer);
            script.remove();
            reject(new Error('Turnstile script could not be loaded'));
        };
        const timer = setTimeout(fail, 10_000);
        script.onerror = fail;
        script.onload = () => {
            if (!window.turnstile?.render) { fail(); return; }
            clearTimeout(timer);
            resolve(window.turnstile);
        };
        document.head.appendChild(script);
    }).catch(error => {
        scriptLoad = undefined;
        throw error;
    });
    return scriptLoad;
}

const challengeType = PropTypes.shape({ siteKey: PropTypes.string.isRequired, action: PropTypes.string.isRequired,
    requestId: PropTypes.string.isRequired }).isRequired;

function TurnstileWidget({ challenge, onToken }) {
    const { siteKey, action, requestId } = challenge;
    const container = useRef(null);
    const [status, setStatus] = useState('loading');
    const [retry, setRetry] = useState(0);
    const complete = useEffectEvent(token => onToken(token));
    useEffect(() => {
        let active = true;
        let widget;
        let api;
        const fail = () => { if (active) setStatus('error'); };
        void loadTurnstile().then(turnstile => {
            if (!active || !container.current) return;
            api = turnstile;
            widget = api.render(container.current, {
                sitekey: siteKey, action, cData: requestId, size: 'flexible', language: 'ko',
                'response-field': false, retry: 'never', 'refresh-expired': 'manual',
                callback: token => {
                    if (!active) return;
                    if (typeof token === 'string' && token.length) complete(token);
                    else fail();
                },
                'error-callback': fail, 'expired-callback': fail, 'timeout-callback': fail,
            });
            if (widget == null) fail();
            else setStatus(current => current === 'loading' ? 'ready' : current);
        }).catch(fail);
        return () => {
            active = false;
            if (widget != null) api.remove(widget);
        };
    }, [siteKey, action, requestId, retry]);

    return <>
        {status === 'loading' && <p role="status">예약 확인을 불러오는 중이에요.</p>}
        <div ref={container} hidden={status === 'error'} />
        {status === 'error' && <>
            <p role="alert">예약 확인을 완료하지 못했어요.</p>
            <Button variant="ghost-sm" onClick={() => { setStatus('loading'); setRetry(value => value + 1); }}>다시 불러오기</Button>
        </>}
    </>;
}
TurnstileWidget.propTypes = { challenge: challengeType, onToken: PropTypes.func.isRequired };

export default function ReservationChallengeModal({ open, challenge, onClose, onToken }) {
    return <ResponsiveModal open={open} onCancel={onClose} title="예약 확인" centered width={440}
        mask={{ closable: false }} destroyOnHidden footer={<Button variant="ghost" onClick={onClose}>취소</Button>}>
        <TurnstileWidget challenge={challenge} onToken={onToken} />
    </ResponsiveModal>;
}

ReservationChallengeModal.propTypes = { open: PropTypes.bool.isRequired, challenge: challengeType,
    onClose: PropTypes.func.isRequired, onToken: PropTypes.func.isRequired };
