import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Avatar } from '../common';
import FeedItemMenu from './FeedItemMenu';
import { authorPath, feedDate, feedRelativeDate } from '../../utils/feed';
import { normalizePublicId } from '../../utils/publicAddress';

export default function FeedCommentRow({ item, actions, children, replies }) {
    const removed = item.state !== 'PUBLISHED';
    const publicId = normalizePublicId(item.publicId);
    const profilePath = authorPath(item.author?.publicId);
    const name = item.author?.nickname;
    const avatar = !removed && <Avatar src={item.author?.avatarUrl} size={32} referrerPolicy="no-referrer" />;
    return <div id={publicId ? 'comment-' + publicId : undefined} tabIndex={-1} className="reserve-feed-comment-block">
        <article className="reserve-feed-comment is-thread-comment" data-list-item-id={'comment:' + item.id}
            aria-label={removed ? '삭제된 댓글' : name + '의 댓글'}>
            <div className="reserve-feed-post-avatar">{!removed && profilePath
                ? <Link to={profilePath} aria-label={name + '의 프로필'}>{avatar}</Link> : avatar}</div>
            <div className="reserve-feed-comment-content">
                {!removed && <header className="reserve-feed-post-header">
                    <div className="reserve-feed-post-byline">
                        {profilePath ? <Link className="reserve-feed-post-name" to={profilePath}><strong>{name}</strong></Link>
                            : <span className="reserve-feed-post-name"><strong>{name}</strong></span>}
                        <time dateTime={item.createdAt} title={feedDate(item.createdAt)}>{feedRelativeDate(item.createdAt)}</time>
                    </div>
                    {actions.length > 0 && <FeedItemMenu label="댓글 메뉴" actions={actions} />}
                </header>}
                <p className={removed ? 'reserve-feed-note' : 'reserve-feed-post-text'}>{removed ? '삭제되거나 숨겨진 댓글이에요.' : item.content}</p>
                {!removed && children}
            </div>
        </article>
        {replies}
    </div>;
}

FeedCommentRow.propTypes = { item: PropTypes.object.isRequired, actions: PropTypes.array.isRequired, children: PropTypes.node, replies: PropTypes.node };
