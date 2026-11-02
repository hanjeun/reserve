import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Typography } from 'antd';
import Card from '../common/Card';
import LoadingImage from '../common/LoadingImage';
import IconTool from '../common/IconTool';
import InterfaceIcon from '../common/InterfaceIcon';
import ContentLikeButton from './ContentLikeButton';
import PostInteractionBar from './PostInteractionBar';
import { feedDate, feedMediaUrl } from '../../utils/feed';
import { BENEFIT_IMAGE_FALLBACK, getBenefitImageUrl } from '../../pages/discovery/benefitPresentation';
import { fontSize } from '../../styles/tokens';

export default function LikedContentItem({ item, view, onShare, onReport }) {
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
    const storeId = news ? value.storeId : value.store?.id;
    const tools = <>
        {Number.isSafeInteger(storeId) && storeId > 0 && <IconTool label="가게 보기" icon={<InterfaceIcon name="store" />} to={`/store/${storeId}`} />}
        <ContentLikeButton type={item.type} targetId={item.targetId} />
        {!value.mine && onReport && <IconTool label={news ? '소식 신고' : comment ? '댓글 신고' : '게시물 신고'}
            icon={<InterfaceIcon name="report" />} onClick={() => onReport(item)} />}
    </>;
    const interactions = !news && !comment && <div className="reserve-liked-secondary-actions"><PostInteractionBar type="POST"
        targetId={item.targetId} postId={item.targetId} showLike={false} onShare={onShare ? () => onShare(value) : undefined} /></div>;
    if (view === 'list') return <article className="reserve-store-list-row reserve-liked-list-row" data-list-item-id={`liked:${item.id}`}>
        <Link to={to} className="reserve-store-card-hit" aria-label={`${title} ${kind} 보기`} />
        <div className="reserve-store-list-row-link">
            <span className="reserve-store-list-row-image"><LoadingImage src={src} alt="" loading="lazy" width={160} height={160}
                onError={event => { if (!event.currentTarget.src.endsWith(BENEFIT_IMAGE_FALLBACK)) event.currentTarget.src = BENEFIT_IMAGE_FALLBACK; }} /></span>
            <div className="reserve-store-list-row-body"><div className="reserve-store-list-row-title-line reserve-liked-title-line">
                <strong className="reserve-store-list-row-name">{title}</strong><div className="reserve-liked-title-tools">{tools}</div></div>
                <span className="reserve-store-list-row-description">{content}</span>{meta}{interactions}</div>
        </div>
    </article>;
    return <Card hoverable className="reserve-liked-card" data-list-item-id={`liked:${item.id}`}>
        <div className="reserve-store-card-shell">
            <Link to={to} className="reserve-store-card-hit" aria-label={`${title} ${kind} 보기`} />
            <Card.Cover src={src} alt="" width={image?.width ?? value.mainImageWidth} height={image?.height ?? value.mainImageHeight} fallbackSrc={BENEFIT_IMAGE_FALLBACK} />
            <div className="reserve-store-card-info"><div className="reserve-store-card-title-line reserve-liked-title-line">
                <Typography.Title level={5} className="reserve-store-card-name" style={{ margin: 0, fontSize: fontSize.xl }}>{title}</Typography.Title>
                <div className="reserve-liked-title-tools">{tools}</div></div>
                <p>{content}</p>{meta}{interactions}</div>
        </div>
    </Card>;
}
LikedContentItem.propTypes = { item: PropTypes.object.isRequired, view: PropTypes.oneOf(['cards', 'list']).isRequired, onShare: PropTypes.func, onReport: PropTypes.func };
