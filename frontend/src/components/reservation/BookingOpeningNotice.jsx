import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import dayjs from 'dayjs';
import RollingFieldValue from '../common/RollingFieldValue';
import { bookingOpeningTimestamp } from '../../utils/bookingOpening';

const twoDigits = number => String(number).padStart(2, '0');

export default function BookingOpeningNotice({ opening, observedAt, onOpen }) {
    const opensAt = bookingOpeningTimestamp(opening);
    const offset = observedAt && Number.isFinite(opening.serverTime) ? opening.serverTime - observedAt : 0;
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (!Number.isFinite(opensAt) || opensAt <= Date.now() + offset) return undefined;
        let timer;
        let opened = false;
        const tick = () => {
            window.clearTimeout(timer);
            const current = Date.now();
            setNow(current);
            const remaining = opensAt - current - offset;
            if (remaining <= 0 && !opened) {
                opened = true;
                onOpen();
            } else if (remaining > 0 && !document.hidden) {
                timer = window.setTimeout(tick, (remaining % 1000) || 1000);
            }
        };
        timer = window.setTimeout(tick, 0);
        document.addEventListener('visibilitychange', tick);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [opensAt, offset, onOpen]);

    const seconds = Math.ceil((opensAt - now - offset) / 1000);
    if (!(seconds > 0)) return null;
    const days = Math.floor(seconds / 86400);
    const time = `${twoDigits(Math.floor(seconds / 3600) % 24)}:${twoDigits(Math.floor(seconds / 60) % 60)}:${twoDigits(seconds % 60)}`;
    return <div className="reserve-booking-opening">
        <span>{dayjs(opening.opensAt).format('M월 D일 HH:mm')} 예약 오픈</span>
        <div className="reserve-booking-opening-time" role="timer" aria-live="off"
            aria-label={`예약 오픈까지 ${days ? `${days}일 ` : ''}${time}`}>
            {days > 0 && <span aria-hidden="true">{[...String(days)].map((digit, index, digits) =>
                <RollingFieldValue key={digits.length - index} value={digit} direction="up">{digit}</RollingFieldValue>)}일&nbsp;</span>}
            {[...time].map((digit, index) => digit === ':' ? <span key={index} aria-hidden="true">:</span>
                : <RollingFieldValue key={index} value={digit} direction="up">{digit}</RollingFieldValue>)}
        </div>
        <span className="reserve-booking-opening-dates">방문일 {opening.from} ~ {opening.to}</span>
    </div>;
}

BookingOpeningNotice.propTypes = {
    opening: PropTypes.shape({ opensAt: PropTypes.string, from: PropTypes.string, to: PropTypes.string, serverTime: PropTypes.number }).isRequired,
    observedAt: PropTypes.number,
    onOpen: PropTypes.func.isRequired,
};
