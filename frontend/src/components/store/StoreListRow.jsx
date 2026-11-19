import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { StarFilled } from '../common/icons';
import FavoriteButton from '../common/FavoriteButton';
import { getThumbnailUrl } from '../../utils';
import { isNearby } from '../../utils/distance';
import { normalizeStoreRating } from '../../utils/storeRating';
import { storeDetailPath } from '../../utils/storePublicAddress';
import adService from '../../services/adService';
import StoreIdentityText from './StoreIdentityText';
import LoadingImage from '../common/LoadingImage';

export function StoreListRowLayout({
    itemKey, className, detailPath, detailLabel, onOpenDetail, detailDisabled = false, title, cover, children, actions, trailing, status,
}) {
    const content = <>
        {cover && <span className="reserve-store-list-row-image">{cover}</span>}
        <span className="reserve-store-list-row-body">
            {title && <span className="reserve-store-list-row-title-line"><strong className="reserve-store-list-row-name">{title}</strong></span>}
            {children}
        </span>
    </>;
    return <article className={['reserve-store-list-row', className].filter(Boolean).join(' ')} data-list-item-id={itemKey}>
        {detailPath ? <Link to={detailPath} className="reserve-store-list-row-link" aria-label={detailLabel}>{content}</Link>
            : onOpenDetail ? <button type="button" className="reserve-store-list-row-link" aria-label={detailLabel}
                disabled={detailDisabled} onClick={onOpenDetail}>{content}</button>
                : <div className="reserve-store-list-row-link">{content}</div>}
        {status ? <div className="reserve-store-list-row-tools">
            <strong className="reserve-store-list-row-status">{status}</strong>
            {actions && <div className="reserve-list-row-actions">{actions}</div>}
        </div> : actions ? <div className="reserve-store-list-row-actions">{actions}</div> : trailing}
    </article>;
}

StoreListRowLayout.propTypes = {
    itemKey: PropTypes.string,
    className: PropTypes.string,
    detailPath: PropTypes.string,
    detailLabel: PropTypes.string,
    onOpenDetail: PropTypes.func,
    detailDisabled: PropTypes.bool,
    title: PropTypes.string,
    cover: PropTypes.node,
    children: PropTypes.node,
    actions: PropTypes.node,
    trailing: PropTypes.node,
    status: PropTypes.node,
};

/**
 * 가게 목록 한 줄 — 가게 목록·홈 추천·내 가게 관리·광고 미리보기가 모두 이 컴포넌트를 재사용한다.
 * actions 를 주면 하트 자리에 관리 버튼(수정·삭제 등)을 둔다.
 */
const StoreListRow = React.memo(({ store, userLocation, isAdvertised = false, adId, preview = false, actions, className, metadata, extraTools }) => {
    const name = store.name || '가게';
    const detailPath = storeDetailPath(store);
    const { rating, reviewCount } = normalizeStoreRating(store.rating, store.reviewCount);
    const nearby = isNearby(userLocation, store.latitude, store.longitude, store.nearbyRadiusKm ?? undefined);
    const fallbackImage = getThumbnailUrl();

    React.useEffect(() => {
        if (!preview && isAdvertised && adId) void adService.recordImpression(adId);
    }, [isAdvertised, adId, preview]);

    const handleImageError = (event) => {
        if (event.currentTarget.src !== fallbackImage) event.currentTarget.src = fallbackImage;
    };

    const favorite = !actions && (
        <div className={`reserve-store-list-row-favorite${extraTools ? ' reserve-store-list-row-favorite--with-tools' : ''}`}>
            <FavoriteButton storeId={store.id} appearance="plain" preview={preview} />
            {extraTools}
        </div>
    );

    return <StoreListRowLayout itemKey={`store:${store.id}`} className={className} title={name}
        detailPath={preview ? undefined : detailPath} detailLabel={`${name} 상세 보기`}
        actions={actions && <>{actions}{extraTools}</>} trailing={favorite}
        cover={<LoadingImage src={getThumbnailUrl(store.mainImageUrl)} alt={`${name} 대표 이미지`}
            width={160} height={160} loading="lazy" decoding="async" onError={handleImageError} />}>
        {store.description && <span className="reserve-store-list-row-description">{store.description}</span>}
        <span className="reserve-store-list-row-meta">
            <span className="reserve-store-list-row-rating">
                <StarFilled aria-hidden="true" />
                <b>{rating.toFixed(1)}</b>
                <span>({reviewCount.toLocaleString('ko-KR')})</span>
            </span>
            <StoreIdentityText category={store.category} isAdvertised={isAdvertised} nearby={nearby} />
        </span>
        {metadata}
    </StoreListRowLayout>;
});

StoreListRow.propTypes = {
    store: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
        name: PropTypes.string,
        category: PropTypes.string,
        description: PropTypes.string,
        mainImageUrl: PropTypes.string,
        rating: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        reviewCount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        latitude: PropTypes.number,
        longitude: PropTypes.number,
        nearbyRadiusKm: PropTypes.number,
    }).isRequired,
    userLocation: PropTypes.shape({
        latitude: PropTypes.number,
        longitude: PropTypes.number,
    }),
    isAdvertised: PropTypes.bool,
    adId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    preview: PropTypes.bool,
    actions: PropTypes.arrayOf(PropTypes.node),
    className: PropTypes.string,
    metadata: PropTypes.node,
    extraTools: PropTypes.node,
};

export default StoreListRow;
