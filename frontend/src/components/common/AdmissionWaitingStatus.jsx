import PropTypes from 'prop-types';
import AnimatedContent from './AnimatedContent';
import AdmissionRank from './AdmissionRank';

/** Rank changes roll only the number; entering the near group changes only its message. */
export default function AdmissionWaitingStatus({ position, caption, description, appearance }) {
    const near = Number.isFinite(position) && position >= 1 && position <= 3;
    return <div aria-live="polite" aria-atomic="true" style={appearance.container}>
        <p style={appearance.caption}>{caption}</p>
        <strong style={appearance.position}><AdmissionRank position={position} /></strong>
        <AnimatedContent motionKey={near ? 'waiting:near' : 'waiting:normal'} direction="down" style={appearance.description}>
            {near ? '곧 입장할 차례예요.' : description}
        </AnimatedContent>
    </div>;
}
AdmissionWaitingStatus.propTypes = { position: PropTypes.number.isRequired, caption: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired, appearance: PropTypes.shape({ container: PropTypes.object,
        caption: PropTypes.object, position: PropTypes.object, description: PropTypes.object }).isRequired };
