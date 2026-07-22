import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Typography, Flex } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { Card, FavoriteButton, Badge } from '../common';
import { getThumbnailUrl } from '../../utils';
import { isNearby } from '../../utils/distance';
import { fontSize } from '../../styles/tokens';
import adService from '../../services/adService';

const { Title, Text } = Typography;

/**
 * 가게 카드 컴포넌트
 * StoreList에서 사용
 *
 * userLocation({ latitude, longitude })을 받으면 가게 좌표와 3km 이내일 때
 * "우리동네" 배지를 표시함. 전달 안 되면(위치 모를 때) 배지 자체를 안 그림 —
 * 위치 권한을 이 카드가 직접 요청하지 않는다(수동적으로 있는 값만 사용).
 *
 * isAdvertised가 true면 "광고" 배지도 함께 표시(배지형 광고 상품). adId가 함께 오면 노출 지표를 서버에 기록한다(2026-07 추가).
 */
const StoreCard = React.memo(({ store, userLocation, isAdvertised = false, adId }) => {
    const navigate = useNavigate();
    const { id, name, category, mainImageUrl, mainImageWidth, mainImageHeight, rating, reviewCount, latitude, longitude, nearbyRadiusKm } = store;
    const nearby = isNearby(userLocation, latitude, longitude, nearbyRadiusKm ?? undefined);

    // 배지형 광고 노출 기록(2026-07 추가) — 카드가 실제로 화면에 그려질 때만 카운트(무한스크롤에 미리
    // 로드된 카드까지 다 카운트하지 않도록 마운트 시점에만 1회 전송 — React.memo라 props가 같으면 재렌더링도
    // 안 되니 중복 전송도 자연스럽게 막힌다).
    React.useEffect(() => {
        if (isAdvertised && adId) adService.recordImpression(adId);
    }, [isAdvertised, adId]);

    return (
        <Card hoverable onClick={() => navigate(`/store/${id}`)}>
            {/* 이미지 + 찜 버튼 */}
            <div style={{ position: 'relative' }}>
                <Card.Cover src={getThumbnailUrl(mainImageUrl)} alt={name} width={mainImageWidth} height={mainImageHeight} />
                {/* 하트 버튼 — 이미지 우상단 */}
                <div
                    style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        zIndex: 1,
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <FavoriteButton storeId={id} size="sm" />
                </div>
            </div>

            <div style={{ padding: '16px 16px 20px' }}>
                <Badge variant="category" style={{ marginBottom: 6 }}>
                    {category || '기타'}
                </Badge>
                {isAdvertised && (
                    <Badge variant="ad" style={{ marginBottom: 6 }}>
                        광고
                    </Badge>
                )}
                {nearby && (
                    <Badge variant="nearby" style={{ marginBottom: 6 }}>
                        우리동네
                    </Badge>
                )}
                <Title level={5} style={{ margin: '0 0 4px', fontSize: fontSize.xl }}>
                    {name}
                </Title>
                <Flex align="center" gap={4}>
                    <StarFilled style={{ color: '#fadb14', fontSize: 14 }} />
                    <Text strong style={{ fontSize: fontSize.sm }}>
                        {rating?.toFixed(1) || '0.0'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: fontSize.xs }}>
                        ({reviewCount || 0})
                    </Text>
                </Flex>
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
        rating: PropTypes.number,
        reviewCount: PropTypes.number,
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
};

export default StoreCard;
