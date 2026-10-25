import PropTypes from 'prop-types';
import useDiscoverySwipe from '../../hooks/useDiscoverySwipe';

/* 모바일 탐색이 활성화될 때만 터치 처리기를 불러온다. */
export default function DiscoverySwipe({ contentRef }) {
    useDiscoverySwipe(contentRef);
    return null;
}
DiscoverySwipe.propTypes = { contentRef: PropTypes.shape({ current: PropTypes.any }).isRequired };
