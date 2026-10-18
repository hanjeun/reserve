import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Avatar } from '../common';
import InterfaceIcon from '../common/InterfaceIcon';
import FeedMediaStrip from './FeedMediaStrip';
import FeedItemMenu from './FeedItemMenu';
import PostInteractionBar from './PostInteractionBar';
import { authorPath, feedDate, feedRelativeDate, feedMediaUrl, feedStateLabel, postPath } from '../../utils/feed';
import { StoreNewsMetadata } from '../store-news/StoreNewsPresentation';

export default function FeedPostCard({ post, detail = false, preview = false, listItemId, onEdit, onDelete, onReport, onShare }) {
    const images = (post.images || []).map(image => ({ ...image, src: feedMediaUrl(image.url) })).filter(image => image.src);
    const author = post.author || {};
    const state = feedStateLabel(post.state);
    const removed = post.state === 'DELETED';
    const storeLink = (to, label, icon) => preview ? <span>{icon}{label}</span> : <Link to={to}>{icon}{label}</Link>;
    const text = <>
        {preview && post.news && <div className="reserve-feed-news-heading"><h2>{post.news.title}</h2><StoreNewsMetadata item={post.news} />
            {post.news.conditions && <p className="reserve-feed-note">적용 조건: {post.news.conditions}</p>}</div>}
        {post.content && <p className={`reserve-feed-post-text${detail || preview ? '' : ' is-summary'}`}>{post.content}</p>}
    </>;
    const avatar = <Avatar src={author.avatarUrl} size={36} referrerPolicy="no-referrer" />;
    const name = <strong>{author.nickname || '공개 프로필'}</strong>;
    const actions = [
        post.mine && ['DRAFT', 'PUBLISHED'].includes(post.state) && onEdit && { key: 'edit', icon: 'edit', label: post.state === 'DRAFT' ? '임시저장 계속 작성' : '게시물 수정', onClick: () => onEdit(post) },
        post.mine && onDelete && { key: 'delete', icon: 'delete', label: '게시물 삭제', danger: true, onClick: () => onDelete(post) },
        !post.mine && onReport && { key: 'report', icon: 'report', label: '게시물 신고', onClick: () => onReport(post) },
    ];
    return <article className={`reserve-feed-post${!detail && !preview ? ' is-list-item' : ''}`} data-list-item-id={listItemId} aria-label={`${author.nickname || '회원'}의 게시물`}>
        <div className="reserve-feed-post-avatar">{preview || !author.publicId ? avatar
            : <Link to={authorPath(author.publicId)} aria-label={`${author.nickname}의 공개 프로필`}>{avatar}</Link>}</div>
        <div className="reserve-feed-post-content">
        <header className="reserve-feed-post-header">
            <div className="reserve-feed-post-byline">
                {preview || !author.publicId ? <span className="reserve-feed-post-name">{name}</span>
                    : <Link className="reserve-feed-post-name" to={authorPath(author.publicId)}>{name}</Link>}
                <time dateTime={post.createdAt} title={feedDate(post.createdAt)}>{feedRelativeDate(post.createdAt)}</time>
                {state && <span className="reserve-feed-post-meta">{state}</span>}
            </div>
            {!preview && !removed && <FeedItemMenu label="게시물 메뉴" actions={actions} />}
        </header>
        {removed ? <p className="reserve-feed-note">삭제된 게시물이에요.</p> : <>
            {detail || preview ? text : <Link className="reserve-feed-post-body-link" to={postPath(post.id)} aria-label="게시물 상세 보기">
                {text}<span className="reserve-discovery-visually-hidden">게시물 상세 보기</span>
            </Link>}
            {images.length > 0 && <div className="reserve-feed-gallery"><FeedMediaStrip images={images} /></div>}
            {post.store && <div className="reserve-feed-store-links">
                {storeLink(`/store/${post.store.id}`, post.store.name, <InterfaceIcon name="store" />)}
                {post.store.reservationEnabled && storeLink(`/store/${post.store.id}`, '예약', <InterfaceIcon name="calendar" />)}
                {post.store.waitingEnabled && storeLink(`/store/${post.store.id}`, '웨이팅', <InterfaceIcon name="clock" />)}
                {storeLink(`/messages?storeId=${post.store.id}`, '문의', <InterfaceIcon name="comment" />)}
            </div>}
        </>}
        {!preview && post.state === 'PUBLISHED' && <PostInteractionBar type="POST" targetId={post.id}
            postId={post.id} onShare={onShare ? () => onShare(post) : undefined} />}
        {preview && <div className="reserve-feed-interactions reserve-feed-preview-actions" aria-hidden="true">
            <span><InterfaceIcon name="heart" /></span><span><InterfaceIcon name="comment" /></span><span><InterfaceIcon name="share" /></span>
        </div>}
        </div>
    </article>;
}
FeedPostCard.propTypes = { post: PropTypes.object.isRequired, detail: PropTypes.bool, preview: PropTypes.bool, listItemId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onEdit: PropTypes.func, onDelete: PropTypes.func, onReport: PropTypes.func, onShare: PropTypes.func };
