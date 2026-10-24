import PropTypes from 'prop-types';
import RollingFieldValue from './RollingFieldValue';
import useReducedMotion from '../../hooks/useReducedMotion';
import { transitions } from '../../styles/tokens';

/** Stable place keys keep unchanged digits still; changed digits roll down independently. */
export default function AdmissionRank({ position }) {
    const reduced = useReducedMotion();
    const number = position.toLocaleString('ko-KR');
    return <span className="reserve-admission-rank" data-rank={position} style={styles.group}>
        <span className="reserve-admission-rank-number" style={{ ...styles.number, width: `${number.length}ch`,
            transition: reduced ? 'none' : `width ${transitions.fast} ${transitions.easing}` }}>
            {[...number].map((digit, index) => /[0-9]/.test(digit)
                ? <RollingFieldValue key={number.length - index - 1} value={digit} direction="down">{digit}</RollingFieldValue>
                : <span key={number.length - index - 1}>{digit}</span>)}
        </span><span className="reserve-admission-rank-suffix">번째</span>
    </span>;
}
const styles = {
    // The contained rolling grid has a synthesized baseline. Align the equal line boxes instead.
    group: { display: 'inline-flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums' },
    number: { display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 },
};
AdmissionRank.propTypes = { position: PropTypes.number.isRequired };
