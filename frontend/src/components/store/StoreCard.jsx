import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Flex } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { Card, FavoriteButton, Badge } from '../common';
import { getThumbnailUrl } from '../../utils';
import { fontSize } from '../../styles/tokens';

const { Title, Text } = Typography;

/**
 * 가게 카드 컴포넌트
 * StoreList에서 사용
 */
const StoreCard = ({ store, isAdvertised = false }) => {
    const navigate = useNavigate();
    const { id, name, category, mainImageUrl, rating, reviewCount } = store;

    return (
        <Card hoverable onClick={() => navigate(`/store/${id}`)}>
            {/* 이미지 + 찜 버튼 */}
            <div style={{ position: 'relative' }}>
                <Card.Cover src={getThumbnailUrl(mainImageUrl)} alt={name} />
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
};

export default StoreCard;
