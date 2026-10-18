import PropTypes from 'prop-types';
import useDiscoverySwipe from '../../hooks/useDiscoverySwipe';

/** The touch controller loads only when a mobile discovery page is active. */
export default function DiscoverySwipe({ contentRef }) {
    useDiscoverySwipe(contentRef);
    return null;
}
DiscoverySwipe.propTypes = { contentRef: PropTypes.shape({ current: PropTypes.any }).isRequired };
