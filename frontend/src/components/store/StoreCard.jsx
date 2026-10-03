import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Typography, Flex } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { Card, FavoriteButton } from '../common';
import { getThumbnailUrl } from '../../utils';
import { isNearby } from '../../utils/distance';
import { normalizeStoreRating } from '../../utils/storeRating';
import { colors, fontSize } from '../../styles/tokens';
import adService from '../../services/adService';
import StoreIdentityText from './StoreIdentityText';

const { Title, Text } = Typography;

/**
 * 가게 카드 컴포넌트
 * StoreList에서 사용
 *
 * userLocation({ latitude, longitude })을 받으면 가게 좌표와 3km 이내일 때
 * "우리동네" 정보 문구를 표시함. 전달 안 되면(위치 모를 때) 문구를 안 그림 —
 * 위치 권한을 이 카드가 직접 요청하지 않는다(수동적으로 있는 값만 사용).
 *
 * isAdvertised가 true면 옅은 AD 표시(AdMark)를 함께 보인다(노출형 광고 상품).
 * preview는 하트까지 실제 카드와 똑같이 그리되 링크·즐겨찾기 동작·노출 집계만 끈다.
 * actions 를 주면 카드 아래에 관리 버튼 줄(수정·삭제 등)을 붙인다 — 내 가게 관리가 같은 카드를 재사용한다.
 * showFavorite=false 는 하트 자리를 비운다(내 가게처럼 찜이 의미 없는 곳).
 */
const StoreCard = React.memo(({ store, userLocation, isAdvertised = false, adId, preview = false, actions, showFavorite = true }) => {
    const { id, name, category, mainImageUrl, mainImageWidth, mainImageHeight, latitude, longitude, nearbyRadiusKm } = store;
    const { rating, reviewCount } = normalizeStoreRating(store.rating, store.reviewCount);
    const nearby = isNearby(userLocation, latitude, longitude, nearbyRadiusKm ?? undefined);

    // 노출형 광고 노출 기록(2026-07 추가) — 카드가 실제로 화면에 그려질 때만 카운트(무한스크롤에 미리
    // 로드된 카드까지 다 카운트하지 않도록 마운트 시점에만 1회 전송 — React.memo라 props가 같으면 재렌더링도
    // 안 되니 중복 전송도 자연스럽게 막힌다).
    React.useEffect(() => {
        if (!preview && isAdvertised && adId) void adService.recordImpression(adId);
    }, [isAdvertised, adId, preview]);

    return (
        <Card hoverable={!preview} actions={actions}>
            <div className={`reserve-store-card-shell${preview ? ' reserve-store-card-shell--preview' : ''}`}>
                {!preview && <Link
                    to={`/store/${id}`}
                    className="reserve-store-card-hit"
                    aria-label={`${name} 상세 보기`}
                />}
                <Card.Cover src={getThumbnailUrl(mainImageUrl)} alt={name} width={mainImageWidth} height={mainImageHeight} />

                <div className="reserve-store-card-info">
                    <div className="reserve-store-card-title-line">
                        <Title level={5} className="reserve-store-card-name" style={{ margin: 0, fontSize: fontSize.xl }}>
                            {name}
                        </Title>
                        <div className="reserve-store-card-favorite">
                            {showFavorite && <FavoriteButton storeId={id} size="sm" appearance="plain" preview={preview} />}
                        </div>
                    </div>
                    <StoreIdentityText category={category} isAdvertised={isAdvertised} nearby={nearby} />
                    <Flex align="center" gap={4} className="reserve-store-card-rating">
                        <StarFilled aria-hidden="true" style={{ color: colors.warning.main, fontSize: 14 }} />
                        <Text strong style={{ fontSize: fontSize.sm }}>
                            {rating.toFixed(1)}
                        </Text>
                        <Text type="secondary" style={{ fontSize: fontSize.xs }}>
                            ({reviewCount.toLocaleString('ko-KR')})
                        </Text>
                    </Flex>
                </div>
            </div>
        </Card>
    );
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
};

export default StoreCard;
