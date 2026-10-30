import useReservationPaymentState from '../../hooks/useReservationPaymentState';
import PropTypes from 'prop-types';
import RollingFieldValue from '../common/RollingFieldValue';
import AnimatedContent from '../common/AnimatedContent';

function Countdown({ state, className = '', style }) {
    const { seconds } = state;
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const remaining = minutes + ':' + String(seconds % 60).padStart(2, '0');
    const phase = seconds === 0 ? 'expired' : seconds <= 60 ? 'urgent' : 'remaining';
    return <span className={"reserve-payment-countdown " + className} data-state={phase} style={style}
        role="timer" aria-live="off" aria-label={seconds ? '결제 남은 시간 ' + remaining : '결제 기한 지남'}>
        <span className="reserve-payment-countdown-label" aria-hidden="true">결제</span>
        <AnimatedContent as="span" className="reserve-payment-countdown-value" motionKey={phase === 'expired' ? 'expired' : 'remaining'} direction="down" aria-hidden="true">
            {seconds ? <span className="reserve-payment-countdown-digits">
                {[...remaining].map((digit, index) => digit === ':' ? <span key="separator">:</span>
                    : <RollingFieldValue key={remaining.length - index} value={digit} direction="down">{digit}</RollingFieldValue>)}
            </span> : '만료'}
        </AnimatedContent>
    </span>;
}
Countdown.propTypes = { state: PropTypes.object.isRequired, className: PropTypes.string, style: PropTypes.object };

function TimedCountdown({ reservation, ...props }) {
    const state = useReservationPaymentState(reservation);
    return state.deadline == null ? null : <Countdown {...props} state={state} />;
}
TimedCountdown.propTypes = { reservation: PropTypes.object.isRequired };

/* 마감 표시는 서버 상태를 바꾸거나 추가 조회를 실행하지 않는다. */
export default function PaymentCountdown({ reservation, state, ...props }) {
    return state ? state.deadline == null ? null : <Countdown {...props} state={state} />
        : <TimedCountdown {...props} reservation={reservation} />;
}
PaymentCountdown.propTypes = { reservation: PropTypes.object.isRequired, state: PropTypes.object, className: PropTypes.string, style: PropTypes.object };
