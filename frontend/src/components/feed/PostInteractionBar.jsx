import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Tooltip from '../common/Tooltip';
import InterfaceIcon from '../common/InterfaceIcon';
import { interactionKeys, useFeedInteractions } from '../../hooks/feedInteractionQueries';
import service from '../../services/feedInteractionService';
import ContentLikeButton from './ContentLikeButton';
import { postCommentsPath } from '../../utils/feed';

export default function PostInteractionBar({ type = 'POST', targetId, postPublicId, onShare, showLike = true, showCounts = true }) {
    const config = useFeedInteractions();
    const enabled = (type === 'NEWS' ? config.data?.newsEnabled : config.data?.enabled) === true && Number.isSafeInteger(targetId) && targetId > 0;
    const key = interactionKeys.status(type, targetId);
    const status = useQuery({ queryKey: key, queryFn: ({ signal }) => service.status(type, targetId, signal), enabled, staleTime: 30_000, retry: false });
    if (!enabled && !onShare) return null;
    const commentsPath = postCommentsPath(postPublicId);
    return <div className="reserve-feed-interactions" data-discovery-swipe-ignore="true">
        {enabled && showLike && <ContentLikeButton type={type} targetId={targetId} showCount={showCounts} />}
        {enabled && commentsPath && <Link className="reserve-feed-interaction" to={commentsPath} aria-label="댓글 보기">
            <InterfaceIcon name="comment" />{showCounts && status.data?.commentCount > 0 && <span>{status.data.commentCount.toLocaleString('ko-KR')}</span>}
        </Link>}
        {onShare && <Tooltip title="게시물 공유"><button type="button" className="reserve-feed-interaction" aria-label="게시물 공유" onClick={onShare}>
            <InterfaceIcon name="share" />
        </button></Tooltip>}
    </div>;
}
PostInteractionBar.propTypes = { type: PropTypes.oneOf(['POST', 'NEWS']), targetId: PropTypes.number.isRequired, postPublicId: PropTypes.string, onShare: PropTypes.func, showLike: PropTypes.bool, showCounts: PropTypes.bool };
