import PropTypes from 'prop-types';
import Card from '../common/Card';
import LoadingImage from '../common/LoadingImage';
import { StoreCardLayout } from '../store/StoreCard';
import { StoreListRowLayout } from '../store/StoreListRow';
import { StoreNewsMetadata } from './StoreNewsPresentation';
import { feedMediaUrl } from '../../utils/feed';
import { benefitReviewLabel } from '../../utils/storeNews';
import { BENEFIT_IMAGE_FALLBACK } from '../../pages/discovery/benefitPresentation';

export default function StoreNewsManagementItem({ item, view, actions, onPreview }) {
    const itemKey = 'news:' + item.id;
    const title = item.title || '제목 없는 소식';
    const detailLabel = title + ' 미리보기';
    const photo = item.images?.[0];
    const photoUrl = feedMediaUrl(photo?.url);
    const status = item.state === 'DRAFT' ? '임시저장'
        : item.state === 'HIDDEN' ? '관리자 숨김' : benefitReviewLabel(item.benefitState);
    const summary = [item.storeName, view === 'cards' && status, item.benefitReviewNote && `심사 사유: ${item.benefitReviewNote}`].filter(Boolean).join(' · ');
    const metadata = <>
        <span className="reserve-store-list-row-description" title={summary}>{summary}</span>
        <StoreNewsMetadata item={item} />
    </>;
    if (view === 'cards') {
        return <StoreCardLayout itemKey={itemKey} title={title} actions={actions} onOpenDetail={onPreview} detailLabel={detailLabel}
            cover={photoUrl && <Card.Cover src={photoUrl} alt="첨부 사진" width={photo.width} height={photo.height}
                referrerPolicy="no-referrer" fallbackSrc={BENEFIT_IMAGE_FALLBACK} />}>
            {metadata}
        </StoreCardLayout>;
    }
    return <StoreListRowLayout itemKey={itemKey} className="reserve-mystore-list-row" title={title} status={status}
        actions={actions} onOpenDetail={onPreview} detailLabel={detailLabel} cover={photoUrl && <LoadingImage src={photoUrl} alt="첨부 사진" width={160} height={160}
            loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => {
                if (event.currentTarget.getAttribute('src') !== BENEFIT_IMAGE_FALLBACK) event.currentTarget.src = BENEFIT_IMAGE_FALLBACK;
            }} />}>
        {metadata}
    </StoreListRowLayout>;
}

StoreNewsManagementItem.propTypes = {
    item: PropTypes.object.isRequired,
    view: PropTypes.oneOf(['list', 'cards']).isRequired,
    actions: PropTypes.arrayOf(PropTypes.node).isRequired,
    onPreview: PropTypes.func.isRequired,
};
