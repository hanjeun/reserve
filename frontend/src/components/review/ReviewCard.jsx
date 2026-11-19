import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { Rate } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Avatar } from '../common';
import CollapsibleContent from '../common/CollapsibleContent';
import InterfaceIcon from '../common/InterfaceIcon';
import { StarFilled } from '../common/icons';
import FeedItemMenu from '../feed/FeedItemMenu';
import ReviewPhotos from './ReviewPhotos';
import ReviewComments from './ReviewComments';
import reviewService from '../../services/reviewService';
import { authorPath } from '../../utils/feed';
import { formatRelativeTime } from '../../utils';
import { handleApiError } from '../../utils/errorHandler';
import { useMessage } from '../../hooks';
import { currentSession, isCurrentSession } from '../../api/sessionScope';

export default function ReviewCard({ review, cardRef, mine, signedIn, onEdit, onDelete, onReport, onLogin, onInteractions, commentsKey }) {
    const [commentsOpen, setCommentsOpen] = useState(false);
    const commentsId = useId();
    const { message } = useMessage();
    const { id, interactions, authorAlias, authorAvatarUrl, authorPublicId } = review;
    const path = authorAlias ? null : authorPath(authorPublicId);
    const name = review.memberName || '리저브 이용자';
    const avatar = <Avatar src={authorAlias ? undefined : authorAvatarUrl} size={36} referrerPolicy="no-referrer" />;
    const liked = Boolean(interactions?.liked);
    const like = useMutation({
        mutationFn: ({ next }) => reviewService.setLike(id, next),
        onSuccess: async (saved, { epoch }) => {
            if (!isCurrentSession(epoch)) return;
            await onInteractions(id, saved);
            if (isCurrentSession(epoch)) message.success(saved.liked ? '좋아요를 눌렀어요.' : '좋아요를 취소했어요.');
        },
        onError: (error, { epoch }) => { if (isCurrentSession(epoch)) handleApiError(error, message); },
    });
    const actions = mine ? [
        { key: 'edit', icon: 'edit', label: '리뷰 수정', onClick: () => onEdit(id) },
        { key: 'delete', icon: 'delete', label: '리뷰 삭제', danger: true, onClick: () => onDelete(id) },
    ] : [
        { key: 'report', icon: 'report', label: '리뷰 신고', onClick: signedIn ? () => onReport(id) : onLogin },
    ];
    return <article ref={cardRef} tabIndex={-1} className="reserve-feed-post reserve-review-scroll-target reserve-store-section-target">
        <div className="reserve-feed-post-avatar">{path ? <Link to={path} aria-label={name + '의 프로필'}>{avatar}</Link> : avatar}</div>
        <div className="reserve-feed-post-content">
            <header className="reserve-feed-post-header">
                <div className="reserve-feed-post-byline">
                    {path ? <Link to={path} className="reserve-feed-post-name"><strong>{name}</strong></Link>
                        : <span className="reserve-feed-post-name"><strong>{name}</strong></span>}
                    <time dateTime={review.createdAt}>{formatRelativeTime(review.createdAt)}</time>
                </div>
                <Rate aria-label={review.rating + '점'} character={<StarFilled aria-hidden="true" />} disabled
                    value={review.rating} className="reserve-review-stars" />
                <FeedItemMenu label="리뷰 메뉴" actions={actions} />
            </header>
            {review.title && <p className="reserve-feed-post-text reserve-review-title">{review.title}</p>}
            <p className="reserve-feed-post-text">{review.content}</p>
            {review.photos?.length > 0 && <div className="reserve-feed-gallery"><ReviewPhotos photos={review.photos} /></div>}
            {review.ownerReply && <div className="reserve-review-reply">
                <strong>사업자 답변</strong>
                <p className="reserve-feed-post-text">{review.ownerReply}</p>
            </div>}
            {interactions && <div className="reserve-feed-interactions" data-discovery-swipe-ignore="true">
                <button type="button" className={liked ? 'reserve-feed-interaction is-liked' : 'reserve-feed-interaction'}
                    aria-label={liked ? '좋아요 취소' : '좋아요'} aria-pressed={liked} aria-busy={like.isPending}
                    disabled={like.isPending} onClick={() => signedIn
                        ? like.mutate({ next: !liked, epoch: currentSession().epoch }) : onLogin()}>
                    <InterfaceIcon name="heart" filled={liked} />
                    {interactions.likeCount > 0 && <span>{interactions.likeCount.toLocaleString('ko-KR')}</span>}
                </button>
                <button type="button" className="reserve-feed-interaction" aria-label={commentsOpen ? '댓글 접기' : '댓글 보기'}
                    aria-controls={commentsId} aria-expanded={commentsOpen} onClick={() => setCommentsOpen(open => !open)}>
                    <InterfaceIcon name="comment" />
                    {interactions.commentCount > 0 && <span>{interactions.commentCount.toLocaleString('ko-KR')}</span>}
                </button>
            </div>}
        </div>
        {interactions && <CollapsibleContent id={commentsId} open={commentsOpen}>
            <ReviewComments id={id} queryKey={commentsKey} open={commentsOpen} signedIn={signedIn} onLogin={onLogin} onInteractions={onInteractions} />
        </CollapsibleContent>}
    </article>;
}
ReviewCard.propTypes = {
    review: PropTypes.object.isRequired, cardRef: PropTypes.func, mine: PropTypes.bool, signedIn: PropTypes.bool,
    onEdit: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired, onReport: PropTypes.func.isRequired,
    onLogin: PropTypes.func.isRequired, onInteractions: PropTypes.func.isRequired, commentsKey: PropTypes.array.isRequired,
};
