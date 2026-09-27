import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { StarFilled } from '@ant-design/icons';
import FavoriteButton from '../common/FavoriteButton';
import { getThumbnailUrl } from '../../utils';
import { isNearby } from '../../utils/distance';
import { normalizeStoreRating } from '../../utils/storeRating';
import adService from '../../services/adService';
import StoreIdentityText from './StoreIdentityText';

/**
 * 가게 목록 한 줄 — 가게 목록·홈 추천·내 가게 관리·광고 미리보기가 모두 이 컴포넌트를 재사용한다.
 * actions 를 주면 하트 자리에 관리 버튼(수정·삭제 등)을 둔다.
 */
const StoreListRow = React.memo(({ store, userLocation, isAdvertised = false, adId, preview = false, actions, className }) => {
    const name = store.name || '가게';
    const { rating, reviewCount } = normalizeStoreRating(store.rating, store.reviewCount);
    const nearby = isNearby(userLocation, store.latitude, store.longitude, store.nearbyRadiusKm ?? undefined);
    const fallbackImage = getThumbnailUrl();

    React.useEffect(() => {
        if (!preview && isAdvertised && adId) adService.recordImpression(adId);
    }, [isAdvertised, adId, preview]);

    const handleImageError = (event) => {
        if (event.currentTarget.src !== fallbackImage) event.currentTarget.src = fallbackImage;
    };

    const content = (
        <>
            <span className="reserve-store-list-row-image">
                <img
                    src={getThumbnailUrl(store.mainImageUrl)}
                    alt={`${name} 대표 이미지`}
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    onError={handleImageError}
                />
            </span>
            <span className="reserve-store-list-row-body">
                <span className="reserve-store-list-row-title-line">
                    <strong className="reserve-store-list-row-name">{name}</strong>
                </span>
                {store.description && (
                    <span className="reserve-store-list-row-description">{store.description}</span>
                )}
                <span className="reserve-store-list-row-meta">
                    <span className="reserve-store-list-row-rating">
                        <StarFilled aria-hidden="true" />
                        <b>{rating.toFixed(1)}</b>
                        <span>({reviewCount.toLocaleString('ko-KR')})</span>
                    </span>
                    <StoreIdentityText category={store.category} isAdvertised={isAdvertised} nearby={nearby} />
                </span>
            </span>
        </>
    );

    return (
        <article className={['reserve-store-list-row', className].filter(Boolean).join(' ')}>
            {preview ? (
                <span className="reserve-store-list-row-link">{content}</span>
            ) : (
                <Link to={`/store/${store.id}`} className="reserve-store-list-row-link" aria-label={`${name} 상세 보기`}>
                    {content}
                </Link>
            )}
            {actions ? (
                <div className="reserve-store-list-row-actions">{actions}</div>
            ) : (
                <div className="reserve-store-list-row-favorite">
                    <FavoriteButton storeId={store.id} size="md" appearance="plain" preview={preview} />
                </div>
            )}
        </article>
    );
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
};

export default StoreListRow;
