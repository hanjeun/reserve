import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Typography, Flex } from 'antd';
import { StarFilled } from '../common/icons';
import { Card, FavoriteButton } from '../common';
import { getThumbnailUrl } from '../../utils';
import { isNearby } from '../../utils/distance';
import { normalizeStoreRating } from '../../utils/storeRating';
import { storeDetailPath } from '../../utils/storePublicAddress';
import { colors, fontSize } from '../../styles/tokens';
import adService from '../../services/adService';
import StoreIdentityText from './StoreIdentityText';

const { Title, Text } = Typography;

export function StoreCardLayout({
    itemKey, title, detailPath, detailLabel, onOpenDetail, detailDisabled = false, cover, titleTools, actions, preview = false, children,
}) {
    return <Card hoverable={!preview && !detailDisabled} actions={actions} data-list-item-id={itemKey}>
        <div className={`reserve-store-card-shell${preview ? ' reserve-store-card-shell--preview' : ''}`}>
            {!preview && (detailPath
                ? <Link to={detailPath} className="reserve-store-card-hit" aria-label={detailLabel} />
                : onOpenDetail && <button type="button" className="reserve-store-card-hit" aria-label={detailLabel}
                    disabled={detailDisabled} onClick={onOpenDetail} />)}
            {cover}
            <div className="reserve-store-card-info">
                <div className="reserve-store-card-title-line">
                    <Title level={5} className="reserve-store-card-name" style={{ margin: 0, fontSize: fontSize.xl }}>{title}</Title>
                    {titleTools && <div className="reserve-store-card-favorite">{titleTools}</div>}
                </div>
                {children}
            </div>
        </div>
    </Card>;
}

StoreCardLayout.propTypes = {
    itemKey: PropTypes.string,
    title: PropTypes.node,
    detailPath: PropTypes.string,
    detailLabel: PropTypes.string,
    onOpenDetail: PropTypes.func,
    detailDisabled: PropTypes.bool,
    cover: PropTypes.node,
    titleTools: PropTypes.node,
    actions: PropTypes.arrayOf(PropTypes.node),
    preview: PropTypes.bool,
    children: PropTypes.node,
};

/*
 * 카드는 위치 권한을 요청하지 않고 전달받은 위치만 사용한다. 미리보기는 표시를 공유하되 이동·즐겨찾기·노출 집계는 실행하지 않는다.
 */
const StoreCard = React.memo(({ store, userLocation, isAdvertised = false, adId, preview = false, actions, showFavorite = true, metadata, extraTools }) => {
    const detailPath = storeDetailPath(store);
    const { id, name, category, mainImageUrl, mainImageWidth, mainImageHeight, latitude, longitude, nearbyRadiusKm } = store;
    const { rating, reviewCount } = normalizeStoreRating(store.rating, store.reviewCount);
    const nearby = isNearby(userLocation, latitude, longitude, nearbyRadiusKm ?? undefined);

    // 노출형 광고 노출 기록 — 카드가 실제로 화면에 그려질 때만 카운트(무한스크롤에 미리
    // 로드된 카드까지 다 카운트하지 않도록 마운트 시점에만 1회 전송 — React.memo라 props가 같으면 재렌더링도
    // 안 되니 중복 전송도 자연스럽게 막힌다).
    React.useEffect(() => {
        if (!preview && isAdvertised && adId) void adService.recordImpression(adId);
    }, [isAdvertised, adId, preview]);

    return <StoreCardLayout itemKey={`store:${id}`} title={name} actions={actions} preview={preview}
        detailPath={detailPath} detailLabel={`${name} 상세 보기`}
        cover={<Card.Cover src={getThumbnailUrl(mainImageUrl)} alt={name} width={mainImageWidth} height={mainImageHeight} />}
        titleTools={<>{showFavorite && <FavoriteButton storeId={id} appearance="plain" preview={preview} />}{extraTools}</>}>
        <StoreIdentityText category={category} isAdvertised={isAdvertised} nearby={nearby} />
        <Flex align="center" gap={4} className="reserve-store-card-rating">
            <StarFilled aria-hidden="true" style={{ color: colors.warning.main, fontSize: 14 }} />
            <Text strong style={{ fontSize: fontSize.sm }}>{rating.toFixed(1)}</Text>
            <Text type="secondary" style={{ fontSize: fontSize.xs }}>({reviewCount.toLocaleString('ko-KR')})</Text>
        </Flex>
        {metadata}
    </StoreCardLayout>;
});

StoreCard.propTypes = {
    store: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
        name: PropTypes.string,
        category: PropTypes.string,
        mainImageUrl: PropTypes.string,
        mainImageWidth: PropTypes.number,
        mainImageHeight: PropTypes.number,
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
    showFavorite: PropTypes.bool,
    metadata: PropTypes.node,
    extraTools: PropTypes.node,
};

export default StoreCard;
