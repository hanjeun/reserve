import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Tooltip from '../common/Tooltip';
import InterfaceIcon from '../common/InterfaceIcon';
import { interactionKeys, useFeedInteractions } from '../../hooks/feedInteractionQueries';
import service from '../../services/feedInteractionService';
import ContentLikeButton from './ContentLikeButton';

export default function PostInteractionBar({ type = 'POST', targetId, postId, onShare }) {
    const config = useFeedInteractions();
    const enabled = (type === 'NEWS' ? config.data?.newsEnabled : config.data?.enabled) === true && Number.isSafeInteger(targetId) && targetId > 0;
    const key = interactionKeys.status(type, targetId);
    const status = useQuery({ queryKey: key, queryFn: ({ signal }) => service.status(type, targetId, signal), enabled, staleTime: 30_000, retry: false });
    if (!enabled && !onShare) return null;
    return <div className="reserve-feed-interactions" data-discovery-swipe-ignore="true">
        {enabled && <ContentLikeButton type={type} targetId={targetId} />}
        {enabled && postId && <Tooltip title="댓글 보기"><Link className="reserve-feed-interaction" to={`/feed/posts/${postId}#comments`} aria-label="댓글 보기">
            <InterfaceIcon name="comment" />{status.data?.commentCount > 0 && <span>{status.data.commentCount.toLocaleString('ko-KR')}</span>}
        </Link></Tooltip>}
        {onShare && <Tooltip title="게시물 공유"><button type="button" className="reserve-feed-interaction" aria-label="게시물 공유" onClick={onShare}>
            <InterfaceIcon name="share" />
        </button></Tooltip>}
    </div>;
}
PostInteractionBar.propTypes = { type: PropTypes.oneOf(['POST', 'NEWS']), targetId: PropTypes.number.isRequired, postId: PropTypes.number, onShare: PropTypes.func };
