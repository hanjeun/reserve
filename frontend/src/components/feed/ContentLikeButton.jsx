import PropTypes from 'prop-types';
import Tooltip from '../common/Tooltip';
import InterfaceIcon from '../common/InterfaceIcon';
import useContentLike from '../../hooks/useContentLike';

export default function ContentLikeButton({ type, targetId, initialStatus }) {
    const like = useContentLike(type, targetId, initialStatus);
    if (!like.enabled) return null;
    return <Tooltip title={like.label}><button type="button" className={`reserve-feed-interaction${like.status.data?.liked ? ' is-liked' : ''}`}
        aria-label={like.label} aria-pressed={Boolean(like.status.data?.liked)} aria-busy={like.busy} disabled={like.busy} onClick={like.click}>
        <InterfaceIcon name="heart" filled={Boolean(like.status.data?.liked)} />
        {like.status.data?.likeCount > 0 && <span>{like.status.data.likeCount.toLocaleString('ko-KR')}</span>}
    </button></Tooltip>;
}
ContentLikeButton.propTypes = { type: PropTypes.oneOf(['POST', 'NEWS', 'COMMENT']).isRequired, targetId: PropTypes.number.isRequired, initialStatus: PropTypes.object };
