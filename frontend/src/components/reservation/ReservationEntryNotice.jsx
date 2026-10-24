import { useEffect, useId, useState } from 'react';
import PropTypes from 'prop-types';
import useMessage from '../../hooks/useMessage';
import { spacing } from '../../styles/tokens';

function Countdown({ expiresAt, onExpire, onPresenceChange }) {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        onPresenceChange(true);
        return () => onPresenceChange(false);
    }, [onPresenceChange]);
    useEffect(() => {
        const tick = () => {
            const value = Date.now();
            setNow(value);
            if (value >= expiresAt) { clearInterval(timer); onExpire(); }
        };
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [expiresAt, onExpire]);
    const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    const minutes = String(Math.floor(seconds / 60));
    const secondDigits = String(seconds % 60).padStart(2, '0');
    return <div className="reserve-reservation-entry-notice" style={{ display: 'inline-flex', alignItems: 'center', gap: spacing[1], whiteSpace: 'nowrap' }}>
        <span>남은</span>
        <div role="timer" aria-label="예약 입장 남은 시간" aria-live="off" style={{ display: 'inline-flex', fontVariantNumeric: 'tabular-nums' }}>
            <span>{minutes}</span>
            <span>:</span>
            <span>{secondDigits}</span>
        </div>
        <span>· 자리 미확보</span>
    </div>;
}
Countdown.propTypes = { expiresAt: PropTypes.number.isRequired, onExpire: PropTypes.func.isRequired,
    onPresenceChange: PropTypes.func.isRequired };

/** One keyed viewport message; its mounted content updates without reopening the live region. */
export default function ReservationEntryNotice({ expiresAt }) {
    const { message } = useMessage();
    const id = useId();
    useEffect(() => {
        if (expiresAt <= Date.now()) return undefined;
        const key = `reservation-entry:${id}`;
        let active = true;
        let contentMounted = false;
        let restoreQueued = false;
        const destroy = () => { active = false; message.destroy(key); };
        const show = () => message.open({ key, type: 'info', duration: 0,
            content: <Countdown expiresAt={expiresAt} onExpire={destroy} onPresenceChange={presenceChanged} /> });
        function presenceChanged(mounted) {
            contentMounted = mounted;
            if (mounted || !active || restoreQueued) return;
            restoreQueued = true;
            // maxCount eviction skips onClose. A StrictMode cleanup/setup restores presence first.
            queueMicrotask(() => {
                restoreQueued = false;
                if (!active || contentMounted) return;
                if (expiresAt <= Date.now()) destroy(); else show();
            });
        }
        show();
        return destroy;
    }, [expiresAt, id, message]);
    return null;
}
ReservationEntryNotice.propTypes = { expiresAt: PropTypes.number.isRequired };
