import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Card from '../common/Card';
import LoadingImage from '../common/LoadingImage';
import ContentLikeButton from './ContentLikeButton';
import PostInteractionBar from './PostInteractionBar';
import { feedDate, feedMediaUrl } from '../../utils/feed';
import { BENEFIT_IMAGE_FALLBACK, getBenefitImageUrl } from '../../pages/discovery/benefitPresentation';

export default function LikedContentItem({ item, view, onShare }) {
    const value = item.post || item.comment || item.news;
    const news = item.type === 'NEWS';
    const comment = item.type === 'COMMENT';
    const kind = news ? '가게 소식' : comment ? '댓글' : '게시물';
    const title = news ? value.title || '제목 없는 소식' : value.author?.nickname || '공개 프로필';
    const content = value.content || value.excerpt || (comment ? '사진 댓글 보기' : '내용 보기');
    const to = news ? `/benefits/${item.targetId}` : comment ? `/feed/posts/${value.postId}#comment-${value.id}` : `/feed/posts/${item.targetId}`;
    const image = value.images?.[0];
    const src = feedMediaUrl(image?.url) || (news ? getBenefitImageUrl(value.mainImageUrl) : BENEFIT_IMAGE_FALLBACK);
    const meta = <span className="reserve-store-list-row-meta"><span>{kind}</span>{news && value.storeName && <span>{value.storeName}</span>}
        {value.createdAt && <time dateTime={value.createdAt}>{feedDate(value.createdAt)}</time>}</span>;
    const like = comment ? <ContentLikeButton key="like" type={item.type} targetId={item.targetId} />
        : <PostInteractionBar key="interactions" type={item.type} targetId={item.targetId} postId={news ? undefined : item.targetId}
            onShare={!news && onShare ? () => onShare(value) : undefined} />;
    if (view === 'list') return <article className="reserve-store-list-row reserve-liked-list-row" data-list-item-id={`liked:${item.id}`}>
        <Link to={to} className="reserve-store-list-row-link" aria-label={`${title} ${kind} 보기`}>
            <span className="reserve-store-list-row-image"><LoadingImage src={src} alt="" loading="lazy" width={160} height={160}
                onError={event => { if (!event.currentTarget.src.endsWith(BENEFIT_IMAGE_FALLBACK)) event.currentTarget.src = BENEFIT_IMAGE_FALLBACK; }} /></span>
            <span className="reserve-store-list-row-body"><span className="reserve-store-list-row-title-line"><strong className="reserve-store-list-row-name">{title}</strong></span>
                <span className="reserve-store-list-row-description">{content}</span>{meta}</span>
        </Link>
        <div className="reserve-store-list-row-actions">{like}</div>
    </article>;
    return <Card hoverable className="reserve-liked-card" data-list-item-id={`liked:${item.id}`} actions={[<div key="actions" className="reserve-liked-item-actions">{like}</div>]}>
        <Link to={to} className="reserve-liked-card-link" aria-label={`${title} ${kind} 보기`}>
            <Card.Cover src={src} alt="" aspectRatio={1} width={image?.width} height={image?.height} fallbackSrc={BENEFIT_IMAGE_FALLBACK} />
            <Card.Body><h3>{title}</h3><p>{content}</p>{meta}</Card.Body>
        </Link>
    </Card>;
}
LikedContentItem.propTypes = { item: PropTypes.object.isRequired, view: PropTypes.oneOf(['cards', 'list']).isRequired, onShare: PropTypes.func };
