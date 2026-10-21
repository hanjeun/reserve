import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { PageTitle } from '../common/PageTypography';
import LoadingImage from '../common/LoadingImage';
import PhotoGallery from '../common/PhotoGallery';
import { feedDate, feedMediaUrl } from '../../utils/feed';
import { storeNewsPeriodLabel, storeNewsTypeLabel } from '../../utils/storeNews';
import { BENEFIT_IMAGE_FALLBACK, formatBenefitDate, getBenefitImageUrl } from '../../pages/discovery/benefitPresentation';

export function StoreNewsMetadata({ item }) {
    if ((!item.newsType || item.newsType === 'NEWS') && !item.periodStatus && !item.startsAt && !item.endsAt) return null;
    return <div className="reserve-store-news-meta">{item.newsType && item.newsType !== 'NEWS' && <span>{storeNewsTypeLabel(item.newsType)}</span>}
        {item.periodStatus && <span className={item.periodStatus === 'ENDED' ? 'is-ended' : ''}>{storeNewsPeriodLabel(item.periodStatus)}</span>}
        {(item.startsAt || item.endsAt) && <span>{item.startsAt ? feedDate(item.startsAt) : '시작 미정'} ~ {item.endsAt ? feedDate(item.endsAt) : '종료 미정'} (한국 시간)</span>}
    </div>;
}
StoreNewsMetadata.propTypes = { item: PropTypes.object.isRequired };

function BannerImage({ imageUrl }) {
    const [failed, setFailed] = useState(false);
    const placeholder = failed || imageUrl === BENEFIT_IMAGE_FALLBACK;
    return <span className={`reserve-benefit-media${placeholder ? ' reserve-benefit-media--placeholder' : ''}`}>
        <LoadingImage className="reserve-benefit-thumbnail" src={placeholder ? BENEFIT_IMAGE_FALLBACK : imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer"
            onError={() => { if (!placeholder) setFailed(true); }} />
    </span>;
}
BannerImage.propTypes = { imageUrl: PropTypes.string.isRequired };

export function BenefitRow({ item, preview = false }) {
    const imageUrl = feedMediaUrl(item.images?.[0]?.url) || getBenefitImageUrl(item.mainImageUrl);
    const design = ['PHOTO', 'COMPACT'].includes(item.design) ? item.design.toLowerCase() : 'standard';
    const className = `reserve-benefit-row reserve-benefit-row--${design}`;
    const content = <><BannerImage key={imageUrl} imageUrl={imageUrl} /><div className="reserve-benefit-row-copy">
        {item.excerpt && <p className="reserve-benefit-description">{item.excerpt}</p>}
        <h2 className="reserve-benefit-store">{item.storeName}</h2>
        <span className="reserve-benefit-title-badge"><span>{item.title}</span></span>
        <StoreNewsMetadata item={item} />
    </div></>;
    return preview ? <div className={className} aria-label={`${item.storeName} · ${item.title} 소식 미리보기`}>{content}</div>
        : <Link to={`/benefits/${item.id}`} className={className} data-list-item-id={item.id} aria-label={`${item.storeName} · ${item.title} 소식 보기`}>{content}</Link>;
}
BenefitRow.propTypes = { item: PropTypes.object.isRequired, preview: PropTypes.bool };

function BenefitPhotos({ pictures }) {
    const [current, setCurrent] = useState(0);
    return <div className="reserve-benefit-photos">
        <PhotoGallery label="혜택" sources={pictures.map(image => image.src)} imageSizes={pictures} adaptiveHeight dots={false} onSlideChange={setCurrent}
            wrapperStyle={{ width: '100%', overflow: 'hidden', borderRadius: 16, lineHeight: 0 }}
            imageStyle={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} />
        {pictures.length > 1 && <span className="reserve-benefit-photo-count reserve-photo-count" aria-label={`사진 ${Math.min(current + 1, pictures.length)} / ${pictures.length}`}>{Math.min(current + 1, pictures.length)} / {pictures.length}</span>}
    </div>;
}
BenefitPhotos.propTypes = { pictures: PropTypes.array.isRequired };

export function BenefitDetailContent({ item, preview = false, actions, status }) {
    const pictures = (item.images || []).map(image => ({ ...image, src: feedMediaUrl(image.url) })).filter(image => image.src);
    const mainImage = getBenefitImageUrl(item.mainImageUrl);
    const design = ['PHOTO', 'COMPACT'].includes(item.design) ? item.design.toLowerCase() : 'standard';
    const store = preview ? <span className="reserve-benefits-text-link">{item.storeName}</span>
        : <Link to={`/store/${item.storeId}`} className="reserve-benefits-text-link">{item.storeName}</Link>;
    return <article className={`reserve-benefits-page reserve-benefit-detail reserve-benefit-detail--${design}`} aria-label={preview ? `${item.title} 가게 소식 미리보기` : undefined} aria-labelledby={preview ? undefined : 'benefit-detail-title'}>
        <header className="reserve-benefits-heading"><div>
            <PageTitle level={preview ? 2 : 1} id={preview ? undefined : 'benefit-detail-title'}>{item.title || '제목 없는 소식'}</PageTitle>
            <div className="reserve-benefit-byline">{store}{item.createdAt && <time dateTime={item.createdAt}>{formatBenefitDate(item.createdAt)}</time>}{status && <span className="reserve-benefit-review-status">{status}</span>}</div>
            <StoreNewsMetadata item={item} /></div></header>
        {pictures.length ? <BenefitPhotos key={pictures.map(image => image.src).join('|')} pictures={pictures} />
            : <LoadingImage className={`reserve-benefit-detail-image${mainImage === BENEFIT_IMAGE_FALLBACK ? ' reserve-benefit-detail-image--placeholder' : ''}`}
                src={mainImage} alt={mainImage === BENEFIT_IMAGE_FALLBACK ? '가게 사진이 등록되지 않았어요' : `${item.storeName} 가게 사진`}
                onError={event => { if (!event.currentTarget.src.endsWith(BENEFIT_IMAGE_FALLBACK)) { event.currentTarget.src = BENEFIT_IMAGE_FALLBACK; event.currentTarget.alt = '가게 사진을 불러오지 못했어요'; event.currentTarget.classList.add('reserve-benefit-detail-image--placeholder'); } }} />}
        <div className="reserve-benefit-detail-content">{item.content}</div>
        {item.conditions && <section className="reserve-store-news-conditions" aria-label="이용 조건"><h2>이용 조건</h2><p>{item.conditions}</p></section>}
        {!preview && <footer className="reserve-benefit-detail-links"><Link className="reserve-benefits-text-link" to="/benefits">소식 목록</Link>
            <Link className="reserve-benefits-text-link" to={`/store/${item.storeId}`}>가게 보기 →</Link>{actions}</footer>}
    </article>;
}
BenefitDetailContent.propTypes = { item: PropTypes.object.isRequired, preview: PropTypes.bool, actions: PropTypes.node, status: PropTypes.string };
