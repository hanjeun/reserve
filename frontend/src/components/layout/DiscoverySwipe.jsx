import PropTypes from 'prop-types';
import useDiscoverySwipe from '../../hooks/useDiscoverySwipe';

/* 좁은 탐색 화면에서만 스와이프 처리기를 불러온다. */
export default function DiscoverySwipe({ contentRef }) {
    useDiscoverySwipe(contentRef);
    return null;
}
DiscoverySwipe.propTypes = { contentRef: PropTypes.shape({ current: PropTypes.any }).isRequired };
